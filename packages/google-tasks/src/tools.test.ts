import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleTasksClient } from "./client.js";
import { GoogleTasksMCPTools, buildPatch, summarizeTask, toTimestamp } from "./tools.js";
import { UpdateTaskParamsSchema } from "./types.js";

describe("toTimestamp", () => {
  it("reads a bare date as midnight UTC", () => {
    expect(toTimestamp("2026-10-22")).toBe("2026-10-22T00:00:00.000Z");
  });

  it("keeps a full timestamp untouched", () => {
    expect(toTimestamp("2026-10-22T13:00:00-03:00")).toBe("2026-10-22T13:00:00-03:00");
  });

  it("passes undefined through", () => {
    expect(toTimestamp(undefined)).toBeUndefined();
  });
});

describe("buildPatch", () => {
  const base = { taskListId: "@default", taskId: "t1" };

  it("sends only the fields that were passed", () => {
    expect(buildPatch(UpdateTaskParamsSchema.parse({ ...base, title: "Novo" }))).toEqual({
      title: "Novo",
    });
  });

  it("removes the due date with null", () => {
    expect(buildPatch(UpdateTaskParamsSchema.parse({ ...base, due: null }))).toEqual({ due: null });
  });

  it("clears the completion date when reopening", () => {
    expect(buildPatch(UpdateTaskParamsSchema.parse({ ...base, status: "needsAction" }))).toEqual({
      status: "needsAction",
      completed: null,
    });
  });

  it("rejects a due date with time of day", () => {
    expect(() => UpdateTaskParamsSchema.parse({ ...base, due: "2026-10-22T10:00:00Z" })).toThrow();
  });
});

describe("summarizeTask", () => {
  it("trims the due timestamp to the date Google actually stores", () => {
    expect(
      summarizeTask({ id: "t1", title: "Ligar", due: "2026-10-30T00:00:00.000Z", status: "needsAction" })
    ).toMatchObject({ taskId: "t1", due: "2026-10-30", status: "needsAction" });
  });
});

describe("GoogleTasksMCPTools against a fake API", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(handler: (url: URL, init: RequestInit) => unknown) {
    const calls: { url: URL; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init: RequestInit = {}) => {
        const url = new URL(input);
        if (url.hostname === "oauth2.googleapis.com") {
          return new Response(JSON.stringify({ access_token: "at", expires_in: 3600, scope: "" }));
        }
        calls.push({ url, init });
        const body = handler(url, init);
        return body === undefined ? new Response(null, { status: 204 }) : new Response(JSON.stringify(body));
      })
    );
    return calls;
  }

  const tools = () =>
    new GoogleTasksMCPTools(
      new GoogleTasksClient({ clientId: "c", clientSecret: "s", refreshToken: "r" })
    );

  it("lists open tasks of the default list, following pages", async () => {
    const calls = stubFetch((url) =>
      url.searchParams.get("pageToken")
        ? { items: [{ id: "t2", title: "B" }] }
        : { items: [{ id: "t1", title: "A" }], nextPageToken: "p2" }
    );

    const result = await tools().listTasks({ taskListId: "@default", showCompleted: false, limit: 100 });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.count).toBe(2);
    expect(calls[0].url.pathname).toBe("/tasks/v1/lists/%40default/tasks");
    expect(calls[0].url.searchParams.get("showCompleted")).toBe("false");
  });

  it("asks for hidden tasks when filtering by completion date", async () => {
    const calls = stubFetch(() => ({ items: [] }));
    await tools().listTasks({
      taskListId: "@default",
      showCompleted: false,
      completedMin: "2026-10-01",
      limit: 10,
    });

    expect(calls[0].url.searchParams.get("showCompleted")).toBe("true");
    expect(calls[0].url.searchParams.get("showHidden")).toBe("true");
    expect(calls[0].url.searchParams.get("completedMin")).toBe("2026-10-01T00:00:00.000Z");
  });

  it("creates a subtask with a due date", async () => {
    const calls = stubFetch((_url, init) => ({ id: "t9", ...JSON.parse(String(init.body)) }));
    const result = await tools().createTask({
      taskListId: "@default",
      title: "Enviar proposta",
      due: "2026-10-30",
      parentTaskId: "t1",
    });

    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url.searchParams.get("parent")).toBe("t1");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      title: "Enviar proposta",
      due: "2026-10-30T00:00:00.000Z",
    });
    expect(JSON.parse(result.content[0].text).due).toBe("2026-10-30");
  });

  it("turns an API error into a tool error instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        new URL(input).hostname === "oauth2.googleapis.com"
          ? new Response(JSON.stringify({ access_token: "at", expires_in: 3600, scope: "" }))
          : new Response("not found", { status: 404 })
      )
    );

    const result = await tools().getTask({ taskListId: "@default", taskId: "missing" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("NOT_FOUND");
  });
});
