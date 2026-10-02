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
    { id: "U006", name: "fabiana", real_name: "Fabiana Souza" },
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

  it("does not match a name hidden in the middle of another word", async () => {
    fetchMock.mockResolvedValue(users(people));
    const error = await newClient().resolveUserId("bia").catch((e) => e);
    expect(error.code).toBe("USER_NOT_FOUND");
  });

  it("takes Enterprise Grid W ids as they are", async () => {
    await expect(newClient().resolveUserId("W0123ABCD")).resolves.toBe("W0123ABCD");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Slack Connect users", () => {
  const routes = (handlers: Record<string, (params: URLSearchParams) => unknown>) =>
    fetchMock.mockImplementation(async (url: string, init: { body?: string }) => {
      const method = url.split("/api/")[1];
      const handler = handlers[method];
      if (!handler) return json({ ok: false, error: "unknown_method" });
      return json(handler(new URLSearchParams(init.body ?? "")));
    });

  const rivera = {
    id: "U0EXTERNAL1",
    name: "support",
    team_id: "TOTHER",
    profile: { display_name: "Pat Rivera (Nimbus)", real_name: "Pat Rivera" },
  };

  const workspace = (dmScope: boolean) => ({
    "users.list": () => ({ ok: true, members: [{ id: "U0HOMEUSER1", name: "sam", real_name: "Sam Costa", profile: {} }] }),
    "users.conversations": (params: URLSearchParams) => {
      if (params.get("types") === "im") {
        return dmScope
          ? { ok: true, channels: [{ id: "D0DIRECTMS1", user: "U0EXTERNAL1" }] }
          : { ok: false, error: "missing_scope", needed: "im:read" };
      }
      return {
        ok: true,
        channels: [
          { id: "C0SHARED1", name: "partner-support", is_ext_shared: true },
          { id: "C0INTERNAL", name: "geral" },
          { id: "G0GROUPDM", name: "mpdm-sam--ana-1", is_mpim: true },
        ],
      };
    },
    "conversations.members": (params: URLSearchParams) =>
      params.get("channel") === "C0SHARED1"
        ? { ok: true, members: ["U0HOMEUSER1", "U0EXTERNAL1"] }
        : { ok: false, error: "unexpected_channel" },
    "users.info": (params: URLSearchParams) =>
      params.get("user") === "U0EXTERNAL1" ? { ok: true, user: rivera } : { ok: false, error: "user_not_found" },
  });

  it("finds a person from another organization through a shared channel, even without the DM scope", async () => {
    routes(workspace(false));

    const all = await newClient().getAllUsers();

    expect(all.find((u) => u.id === "U0EXTERNAL1")).toMatchObject({
      real_name: "Pat Rivera",
      display_name: "Pat Rivera (Nimbus)",
      external: true,
    });
  });

  it("finds them through an open DM when the token can list DMs", async () => {
    const handlers = workspace(true);
    routes({ ...handlers, "conversations.members": () => ({ ok: true, members: [] }) });

    await expect(newClient().resolveUserId("nimbus")).resolves.toBe("U0EXTERNAL1");
  });

  it("resolves them by nickname, full name and parenthesis", async () => {
    routes(workspace(false));
    const client = newClient();

    for (const query of ["nimbus", "pat (nimbus)", "Pat Rivera", "rivera"]) {
      await expect(client.resolveUserId(query)).resolves.toBe("U0EXTERNAL1");
    }
  });

  it("suggests the closest people when a name does not resolve, and sends nothing", async () => {
    routes(workspace(false));

    const error = await newClient().resolveUserId("Pat Nimbos").catch((e) => e);

    expect(error.code).toBe("USER_NOT_FOUND");
    expect(error.message).toContain("U0EXTERNAL1");
    expect(error.message).toContain("Nothing was sent");
  });
});

describe("missing scopes", () => {
  it("names the scope Slack asked for", async () => {
    fetchMock.mockResolvedValue(json({ ok: false, error: "missing_scope", needed: "users:read.email", provided: "users:read" }));

    const error = await newClient().resolveUserId("pat@partner.example").catch((e) => e);

    expect(error.code).toBe("MISSING_SCOPE");
    expect(error.message).toContain("users:read.email");
    expect(error.message).toContain("users.lookupByEmail");
  });
});

describe("resolveDm", () => {
  it("takes a DM id as it is, without looking anyone up", async () => {
    await expect(newClient().resolveDm("D0DIRECTMS1")).resolves.toEqual({ channelId: "D0DIRECTMS1", userId: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("takes a link to the DM", async () => {
    const dm = await newClient().resolveDm("https://example.slack.com/archives/D0DIRECTMS1");
    expect(dm.channelId).toBe("D0DIRECTMS1");
  });

  it("opens the DM of a user id from another organization", async () => {
    fetchMock.mockResolvedValue(json({ ok: true, channel: { id: "D0DIRECTMS1" } }));

    await expect(newClient().resolveDm("U0EXTERNAL1")).resolves.toEqual({ channelId: "D0DIRECTMS1", userId: "U0EXTERNAL1" });
    expect(fetchMock.mock.calls[0][0]).toContain("conversations.open");
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
