import { SlackClient } from "../slack-client.js";
import type {
  GetThreadFromLinkParams,
  McpToolResult,
  SlackMessage,
} from "../types.js";
import { SlackAdvancedMCPError } from "../types.js";

export class ThreadTools {
  constructor(private readonly slack: SlackClient) {}

  async getThreadFromLink(params: GetThreadFromLinkParams): Promise<McpToolResult> {
    try {
      const parsed = this.slack.parseThreadLink(params.url);

      if (!parsed) {
        return this.ok({
          error: "Invalid Slack thread URL. Expected format: https://workspace.slack.com/archives/CHANNEL_ID/pTIMESTAMP",
        });
      }

      const { channelId, threadTs } = parsed;

      const parentRes = await this.slack.request<{
        ok: boolean;
        messages: SlackMessage[];
      }>("conversations.history", {
        channel: channelId,
        latest: threadTs,
        inclusive: true,
        limit: 1,
      });

      const parentMessage = parentRes.messages?.[0];

      const repliesParams: Record<string, unknown> = {
        channel: channelId,
        ts: threadTs,
        limit: params.limit,
      };

      const repliesRes = await this.slack.request<{
        ok: boolean;
        messages: SlackMessage[];
        has_more: boolean;
        response_metadata?: { next_cursor?: string };
      }>("conversations.replies", repliesParams);

      const userIds = new Set<string>();
      for (const m of repliesRes.messages) {
        if (m.user) userIds.add(m.user);
      }

      const userNames = new Map<string, string>();
      const allUsers = await this.slack.getAllUsers();
      for (const uid of userIds) {
        const u = allUsers.find((usr) => usr.id === uid);
        if (u) userNames.set(uid, u.real_name || u.display_name || u.name);
      }

      const messages = repliesRes.messages.map((m) => ({
        user_id: m.user,
        user_name: m.user ? userNames.get(m.user) ?? m.user : "unknown",
        text: m.text,
        ts: m.ts,
        has_files: (m.files?.length ?? 0) > 0,
        files: m.files?.map((f) => ({
          id: f.id,
          name: f.name,
          mimetype: f.mimetype,
          size: f.size,
        })),
      }));

      return this.ok({
        channel_id: channelId,
        thread_ts: threadTs,
        parent_text: parentMessage?.text ?? null,
        message_count: messages.length,
        participants: [...userNames.entries()].map(([id, name]) => ({ id, name })),
        messages,
        has_more: repliesRes.has_more,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  private ok(data: unknown): McpToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private formatError(error: unknown): McpToolResult {
    const message =
      error instanceof SlackAdvancedMCPError
        ? `Slack Error: ${error.message}`
        : error instanceof Error
          ? `Unexpected error: ${error.message}`
          : "Unexpected error: Unknown error";

    return {
      content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    };
  }
}
