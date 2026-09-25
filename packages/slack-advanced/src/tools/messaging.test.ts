import { describe, it, expect, vi } from "vitest";
import { MessagingTools, isAiAttributionEnabled } from "./messaging.js";
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
