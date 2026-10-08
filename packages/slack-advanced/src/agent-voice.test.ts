import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { AgentVoice, readHiveLink } from "./agent-voice.js";

const LINK = { token: "relay-token", relay: "https://hive-slack.example.com" };

const relayAnswering = (body: unknown) =>
  vi.fn().mockResolvedValue({ json: async () => body }) as unknown as typeof fetch;

describe("readHiveLink", () => {
  it("reads the token and relay the Hive saved when it was linked to Slack", () => {
    const home = mkdtempSync(join(tmpdir(), "slack-advanced-link-"));
    writeFileSync(join(home, "slack-link.json"), JSON.stringify({ ...LINK, relay: `${LINK.relay}/`, user: "U1" }));
    expect(readHiveLink(home)).toEqual(LINK);
  });

  it("is null when the Hive was never linked", () => {
    expect(readHiveLink(mkdtempSync(join(tmpdir(), "slack-advanced-link-")))).toBeNull();
  });
});

describe("AgentVoice", () => {
  it("posts the thread reply through the relay with the link token", async () => {
    const fetchImpl = relayAnswering({ ok: true, channel: "C1", ts: "2.0" });

    const post = await new AgentVoice(LINK, fetchImpl).replyInThread("C1", "1.0", "oi");

    expect(post).toEqual({ posted: true, channel: "C1", ts: "2.0" });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${LINK.relay}/api/chat.postMessage`);
    expect(init.headers.authorization).toBe("Bearer relay-token");
    expect(Object.fromEntries(init.body)).toEqual({ channel: "C1", thread_ts: "1.0", text: "oi" });
  });

  it("reports the refusal when the user is not part of the thread", async () => {
    const post = await new AgentVoice(LINK, relayAnswering({ ok: false, error: "not_your_thread" })).replyInThread("C1", "1.0", "oi");
    expect(post).toEqual({ posted: false, reason: "the Hive relay refused: not_your_thread" });
  });

  it("does not try without a link", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const post = await new AgentVoice(null, fetchImpl).replyInThread("C1", "1.0", "oi");
    expect(post.posted).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("says the reply may be out when the relay does not answer", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timed out")) as unknown as typeof fetch;
    const post = await new AgentVoice(LINK, fetchImpl).replyInThread("C1", "1.0", "oi");
    expect(post).toMatchObject({ posted: false, maybePosted: true });
  });
});
