import { SlackClient } from "../slack-client.js";
import { extractMessageText } from "../formatting.js";
import type {
  GetThreadFromLinkParams,
  McpToolResult,
  SlackMessage,
} from "../types.js";
import { toolError, toolOk } from "./result.js";

export class ThreadTools {
  constructor(private readonly slack: SlackClient) {}

  async getThreadFromLink(params: GetThreadFromLinkParams): Promise<McpToolResult> {
    try {
      const parsed = this.slack.parseThreadLink(params.url);

      if (!parsed) {
        return toolError("Invalid Slack thread URL. Expected format: https://workspace.slack.com/archives/CHANNEL_ID/pTIMESTAMP");
      }

      const { channelId, threadTs, messageTs } = parsed;

      const repliesRes = await this.slack.request<{
        ok: boolean;
        messages: SlackMessage[];
        has_more: boolean;
        response_metadata?: { next_cursor?: string };
      }>("conversations.replies", {
        channel: channelId,
        ts: threadTs,
        limit: params.limit,
        cursor: params.cursor,
        include_all_metadata: true,
      });

      const parentMessage = params.cursor
        ? undefined
        : repliesRes.messages.find((m) => m.ts === threadTs);

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
        text: extractMessageText(m),
        ts: m.ts,
        has_files: (m.files?.length ?? 0) > 0,
        files: m.files?.map((f) => ({
          id: f.id,
          name: f.name,
          mimetype: f.mimetype,
          size: f.size,
        })),
        ...(m.metadata && { metadata: m.metadata }),
      }));

      return toolOk({
        channel_id: channelId,
        thread_ts: threadTs,
        linked_message_ts: messageTs,
        parent_text: parentMessage ? extractMessageText(parentMessage) : null,
        message_count: messages.length,
        participants: [...userNames.entries()].map(([id, name]) => ({ id, name })),
        messages,
        has_more: repliesRes.has_more,
        next_cursor: repliesRes.response_metadata?.next_cursor || null,
      });
    } catch (error) {
      return toolError(error);
    }
  }
}
