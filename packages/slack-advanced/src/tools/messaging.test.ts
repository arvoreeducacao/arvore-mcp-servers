import { describe, it, expect, vi } from "vitest";
import { MessagingTools, isAiAttributionEnabled, parsePostAt } from "./messaging.js";
import { SlackAdvancedMCPError } from "../types.js";
import type { SlackClient } from "../slack-client.js";

const sentBlocks = async (attribution?: boolean): Promise<Array<Record<string, unknown>>> => {
  const request = vi.fn().mockResolvedValue({ ok: true, channel: "C1", ts: "1.0" });
  const slack = { resolveChannelId: vi.fn().mockResolvedValue("C1"), request } as unknown as SlackClient;
  const tools = attribution === undefined ? new MessagingTools(slack) : new MessagingTools(slack, attribution);

  await tools.sendChannelMessage({ channel: "C1", text: "oi" });

  const [, params] = request.mock.calls.find(([method]) => method === "chat.postMessage")!;
  return JSON.parse((params as { blocks: string }).blocks);
};

describe("AI attribution", () => {
  it("puts the attribution line on top by default", async () => {
    const blocks = await sentBlocks();
    expect(blocks[0]).toEqual({
      type: "context",
      elements: [{ type: "mrkdwn", text: "Mensagem gerada e enviada por um agente de IA" }],
    });
  });

  it("leaves the attribution line out when disabled", async () => {
    const blocks = await sentBlocks(false);
    expect(blocks.some((block) => block.type === "context")).toBe(false);
    expect(blocks[0].type).toBe("rich_text");
  });
});

describe("isAiAttributionEnabled", () => {
  it("stays on when the variable is unset or truthy", () => {
    expect(isAiAttributionEnabled(undefined)).toBe(true);
    expect(isAiAttributionEnabled("")).toBe(true);
    expect(isAiAttributionEnabled("true")).toBe(true);
  });

  it("turns off for false-like values", () => {
    for (const value of ["false", "FALSE", "0", "off", " no "]) {
      expect(isAiAttributionEnabled(value)).toBe(false);
    }
  });
});

describe("parsePostAt", () => {
  it("reads Unix seconds as a number or a string", () => {
    expect(parsePostAt(1790365612)).toBe(1790365612);
    expect(parsePostAt("1790365612")).toBe(1790365612);
  });

  it("reads an ISO date with timezone", () => {
    expect(parsePostAt("2026-10-01T09:00:00-03:00")).toBe(Date.parse("2026-10-01T12:00:00Z") / 1000);
  });

  it("refuses an ISO date without timezone, which would silently use the server clock zone", () => {
    expect(parsePostAt("2026-10-01T09:00:00")).toBeNull();
  });
});

describe("tool errors", () => {
  const slackThatFails = (error: Error) =>
    ({
      resolveChannelId: vi.fn().mockResolvedValue("C0123ABCD"),
      resolveUserId: vi.fn().mockRejectedValue(error),
      request: vi.fn().mockRejectedValue(error),
    }) as unknown as SlackClient;

  it("marks a failed send as an error so the agent does not read it as sent", async () => {
    const tools = new MessagingTools(slackThatFails(new SlackAdvancedMCPError("Slack API error: channel_not_found", "SLACK_API_ERROR")));

    const result = await tools.sendChannelMessage({ channel: "C0123ABCD", text: "oi" });

    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toMatchObject({ code: "SLACK_API_ERROR" });
  });

  it("does not open a group DM when one of the names is ambiguous", async () => {
    const request = vi.fn();
    const slack = {
      resolveUserId: vi
        .fn()
        .mockResolvedValueOnce("U001")
        .mockRejectedValueOnce(new SlackAdvancedMCPError("matches more than one user", "AMBIGUOUS_USER")),
      request,
    } as unknown as SlackClient;

    const result = await new MessagingTools(slack).createGroupDm({ users: ["ana", "joão"], message: "oi" });

    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses a schedule in the past without calling Slack", async () => {
    const request = vi.fn();
    const slack = { resolveChannelId: vi.fn(), request } as unknown as SlackClient;

    const result = await new MessagingTools(slack).scheduleMessage({ channel: "C0123ABCD", text: "oi", post_at: 1 });

    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("channel names on message actions", () => {
  it("resolves #name before reacting", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    const slack = { resolveChannelId: vi.fn().mockResolvedValue("C0123ABCD"), request } as unknown as SlackClient;

    await new MessagingTools(slack).addReaction({ channel: "#eng-prs", ts: "1.2", emoji: "eyes" });

    expect(request).toHaveBeenCalledWith("reactions.add", { channel: "C0123ABCD", timestamp: "1.2", name: "eyes" });
  });
});
