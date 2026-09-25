import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SlackClient, isSlackFileHost } from "./slack-client.js";
import { SlackAdvancedMCPError } from "./types.js";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const newClient = () =>
  new SlackClient("xoxp-test", join(tmpdir(), `slack-advanced-test-${Math.random()}.json`), 240, {
    retryBaseMs: 1,
    requestTimeoutMs: 1_000,
  });

const users = (members: Array<{ id: string; name: string; real_name?: string; display_name?: string }>) =>
  json({
    ok: true,
    members: members.map((m) => ({ ...m, profile: { display_name: m.display_name ?? "" } })),
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("request retries", () => {
  it("retries a read after a 5xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("oops", { status: 503 })).mockResolvedValueOnce(json({ ok: true, value: 1 }));

    const res = await newClient().request<{ value: number }>("conversations.history", {});

    expect(res.value).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a read after a network error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(json({ ok: true }));

    await newClient().request("users.info", {});

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries a write after a 5xx, so a message is not posted twice", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 502 }));

    await expect(newClient().request("chat.postMessage", {})).rejects.toMatchObject({ code: "SLACK_HTTP_ERROR" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never retries a write after a network error and says it may have gone through", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(newClient().request("chat.postMessage", {})).rejects.toThrow(/may or may not have been applied/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries any method on 429, since Slack rejected it before doing anything", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(json({ ok: true }));

    await newClient().request("chat.postMessage", {});

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes a timeout signal to every call", async () => {
    fetchMock.mockResolvedValue(json({ ok: true }));

    await newClient().request("users.info", {});

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("resolveUserId", () => {
  const people = [
    { id: "U001", name: "ana", real_name: "Ana Souza" },
    { id: "U002", name: "mariana", real_name: "Mariana Lima" },
    { id: "U003", name: "anabela", real_name: "Anabela Reis" },
    { id: "U004", name: "joao.silva", real_name: "João Silva" },
    { id: "U005", name: "joao.santos", real_name: "João Santos" },
  ];

  it("prefers the one exact match over partial ones", async () => {
    fetchMock.mockResolvedValue(users(people));
    await expect(newClient().resolveUserId("ana")).resolves.toBe("U001");
  });

  it("refuses to guess when a partial name matches more than one person", async () => {
    fetchMock.mockResolvedValue(users(people));

    const error = await newClient().resolveUserId("joão").catch((e) => e);

    expect(error).toBeInstanceOf(SlackAdvancedMCPError);
    expect(error.code).toBe("AMBIGUOUS_USER");
    expect(error.message).toContain("U004");
    expect(error.message).toContain("U005");
  });

  it("accepts a single partial match", async () => {
    fetchMock.mockResolvedValue(users(people));
    await expect(newClient().resolveUserId("santos")).resolves.toBe("U005");
  });

  it("takes Enterprise Grid W ids as they are", async () => {
    await expect(newClient().resolveUserId("W0123ABCD")).resolves.toBe("W0123ABCD");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolveChannelId", () => {
  it("caches the name so a second send does not walk the channel list again", async () => {
    fetchMock.mockResolvedValue(json({ ok: true, channels: [{ id: "C0AAAAAAA", name: "eng-prs" }] }));
    const client = newClient();

    expect(await client.resolveChannelId("#eng-prs")).toBe("C0AAAAAAA");
    expect(await client.resolveChannelId("#eng-prs")).toBe("C0AAAAAAA");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("takes DM ids as they are", async () => {
    await expect(newClient().resolveChannelId("D0123ABCD")).resolves.toBe("D0123ABCD");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("downloadFile", () => {
  it("never sends the token outside slack.com", async () => {
    await expect(newClient().downloadFile("https://attacker.example/x.png")).rejects.toMatchObject({
      code: "UNTRUSTED_FILE_URL",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses plain http even on slack.com", async () => {
    await expect(newClient().downloadFile("http://files.slack.com/x.png")).rejects.toMatchObject({
      code: "UNTRUSTED_FILE_URL",
    });
  });

  it("refuses a lookalike host", async () => {
    await expect(newClient().downloadFile("https://files.slack.com.attacker.example/x")).rejects.toMatchObject({
      code: "UNTRUSTED_FILE_URL",
    });
  });

  it("does not follow a redirect off Slack with the token", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://attacker.example/x" } }));

    await expect(newClient().downloadFile("https://files.slack.com/x.png")).rejects.toMatchObject({
      code: "UNTRUSTED_FILE_URL",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("downloads from files.slack.com", async () => {
    fetchMock.mockResolvedValueOnce(new Response("abc", { status: 200 }));

    const buffer = await newClient().downloadFile("https://files.slack.com/files-pri/T1-F1/x.png");

    expect(buffer.toString()).toBe("abc");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer xoxp-test");
  });

  it("recognizes Slack hosts", () => {
    expect(isSlackFileHost("files.slack.com")).toBe(true);
    expect(isSlackFileHost("a.slack-edge.com")).toBe(true);
    expect(isSlackFileHost("slack.com.evil.io")).toBe(false);
    expect(isSlackFileHost("notslack.com")).toBe(false);
  });
});

describe("parseThreadLink", () => {
  const client = () => newClient();

  it("reads the thread root from a link to the root", () => {
    expect(client().parseThreadLink("https://w.slack.com/archives/C0123ABCD/p1790365612684249")).toEqual({
      channelId: "C0123ABCD",
      threadTs: "1790365612.684249",
      messageTs: "1790365612.684249",
    });
  });

  it("reads the thread root from a link to a reply", () => {
    const parsed = client().parseThreadLink(
      "https://w.slack.com/archives/C0123ABCD/p1790365700000100?thread_ts=1790365612.684249&cid=C0123ABCD"
    );
    expect(parsed).toEqual({
      channelId: "C0123ABCD",
      threadTs: "1790365612.684249",
      messageTs: "1790365700.000100",
    });
  });

  it("rejects something that is not a Slack message link", () => {
    expect(client().parseThreadLink("https://example.com/p123")).toBeNull();
  });
});
