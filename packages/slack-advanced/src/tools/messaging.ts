import { slackifyMarkdown } from "slackify-markdown";
import { SlackClient } from "../slack-client.js";
import type {
  SendDmParams,
  GetDmHistoryParams,
  ListChannelMessagesParams,
  SendChannelMessageParams,
  EditMessageParams,
  DeleteMessageParams,
  AddReactionParams,
  RemoveReactionParams,
  CreateChannelParams,
  CreateGroupDmParams,
  WaitForReplyParams,
  McpToolResult,
  SlackMessage,
} from "../types.js";
import { SlackAdvancedMCPError } from "../types.js";

export class MessagingTools {
  private readonly ATTRIBUTION_TEXT = "Mensagem gerada e enviada por um agente de IA";

  constructor(private readonly slack: SlackClient) {}

  private toMrkdwn(text: string): string {
    return slackifyMarkdown(text);
  }

  private buildBlocks(text: string): Array<Record<string, unknown>> {
    return [
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: this.ATTRIBUTION_TEXT }],
      },
      { type: "section", block_id: "msg", text: { type: "mrkdwn", text } },
    ];
  }

  async sendDm(params: SendDmParams): Promise<McpToolResult> {
    try {
      const userId = await this.slack.resolveUserId(params.user);
      const channelId = await this.slack.openDm(userId);

      const mrkdwn = this.toMrkdwn(params.text);
      const blocks = this.buildBlocks(mrkdwn);
      const msgParams: Record<string, unknown> = {
        channel: channelId,
        text: mrkdwn,
        blocks: JSON.stringify(blocks),
        unfurl_links: false,
        unfurl_media: false,
      };

      if (params.thread_ts) {
        msgParams.thread_ts = params.thread_ts;
      }

      if (params.metadata) {
        msgParams.metadata = JSON.stringify(params.metadata);
      }

      const res = await this.slack.request<{
        ok: boolean;
        channel: string;
        ts: string;
        message: { text: string; ts: string };
      }>("chat.postMessage", msgParams);

      return this.ok({
        sent: true,
        channel: res.channel,
        ts: res.ts,
        to_user_id: userId,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async getDmHistory(params: GetDmHistoryParams): Promise<McpToolResult> {
    try {
      const userId = await this.slack.resolveUserId(params.user);
      const channelId = await this.slack.openDm(userId);

      const historyParams: Record<string, unknown> = {
        channel: channelId,
        limit: params.limit,
      };

      if (params.cursor) {
        historyParams.cursor = params.cursor;
      }

      const res = await this.slack.request<{
        ok: boolean;
        messages: SlackMessage[];
        has_more: boolean;
        response_metadata?: { next_cursor?: string };
      }>("conversations.history", historyParams);

      return this.ok({
        messages: res.messages.map((m) => ({
          user: m.user,
          text: m.text,
          ts: m.ts,
          thread_ts: m.thread_ts,
          reply_count: m.reply_count,
          has_files: (m.files?.length ?? 0) > 0,
          files: m.files?.map((f) => ({
            id: f.id,
            name: f.name,
            mimetype: f.mimetype,
            filetype: f.filetype,
            size: f.size,
          })),
        })),
        has_more: res.has_more,
        next_cursor: res.response_metadata?.next_cursor || null,
        channel_id: channelId,
        with_user_id: userId,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async listChannelMessages(params: ListChannelMessagesParams): Promise<McpToolResult> {
    try {
      const channelId = await this.slack.resolveChannelId(params.channel);

      const historyParams: Record<string, unknown> = {
        channel: channelId,
        limit: params.limit,
        include_all_metadata: true,
      };

      if (params.cursor) historyParams.cursor = params.cursor;
      if (params.oldest) historyParams.oldest = params.oldest;
      if (params.latest) historyParams.latest = params.latest;
      if (params.inclusive) historyParams.inclusive = params.inclusive;

      const res = await this.slack.request<{
        ok: boolean;
        messages: SlackMessage[];
        has_more: boolean;
        response_metadata?: { next_cursor?: string };
      }>("conversations.history", historyParams);

      const userIds = new Set<string>();
      for (const m of res.messages) {
        if (m.user) userIds.add(m.user);
      }

      const userNames = new Map<string, string>();
      if (userIds.size > 0) {
        const allUsers = await this.slack.getAllUsers();
        for (const uid of userIds) {
          const u = allUsers.find((usr) => usr.id === uid);
          if (u) userNames.set(uid, u.real_name || u.display_name || u.name);
        }
      }

      return this.ok({
        channel_id: channelId,
        messages: res.messages.map((m) => ({
          user_id: m.user,
          user_name: m.user ? userNames.get(m.user) ?? m.user : null,
          text: m.text,
          ts: m.ts,
          thread_ts: m.thread_ts,
          reply_count: m.reply_count,
          has_files: (m.files?.length ?? 0) > 0,
          files: m.files?.map((f) => ({
            id: f.id,
            name: f.name,
            mimetype: f.mimetype,
            filetype: f.filetype,
            size: f.size,
          })),
          ...(m.metadata && { metadata: m.metadata }),
        })),
        has_more: res.has_more,
        next_cursor: res.response_metadata?.next_cursor || null,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async sendChannelMessage(params: SendChannelMessageParams): Promise<McpToolResult> {
    try {
      const channelId = await this.slack.resolveChannelId(params.channel);

      const mrkdwn = this.toMrkdwn(params.text);
      const blocks = this.buildBlocks(mrkdwn);
      const msgParams: Record<string, unknown> = {
        channel: channelId,
        text: mrkdwn,
        blocks: JSON.stringify(blocks),
        unfurl_links: false,
        unfurl_media: false,
      };

      if (params.thread_ts) {
        msgParams.thread_ts = params.thread_ts;
      }

      if (params.metadata) {
        msgParams.metadata = JSON.stringify(params.metadata);
      }

      const res = await this.slack.request<{
        ok: boolean;
        channel: string;
        ts: string;
        message: { text: string; ts: string };
      }>("chat.postMessage", msgParams);

      return this.ok({
        sent: true,
        channel: res.channel,
        ts: res.ts,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async editMessage(params: EditMessageParams): Promise<McpToolResult> {
    try {
      const mrkdwn = this.toMrkdwn(params.text);
      const blocks = this.buildBlocks(mrkdwn);

      const res = await this.slack.request<{
        ok: boolean;
        channel: string;
        ts: string;
        text: string;
      }>("chat.update", {
        channel: params.channel,
        ts: params.ts,
        text: mrkdwn,
        blocks: JSON.stringify(blocks),
      });

      return this.ok({
        edited: true,
        channel: res.channel,
        ts: res.ts,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async deleteMessage(params: DeleteMessageParams): Promise<McpToolResult> {
    try {
      const res = await this.slack.request<{
        ok: boolean;
        channel: string;
        ts: string;
      }>("chat.delete", {
        channel: params.channel,
        ts: params.ts,
      });

      return this.ok({
        deleted: true,
        channel: res.channel,
        ts: res.ts,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async addReaction(params: AddReactionParams): Promise<McpToolResult> {
    try {
      await this.slack.request<{ ok: boolean }>("reactions.add", {
        channel: params.channel,
        timestamp: params.ts,
        name: params.emoji,
      });

      return this.ok({
        reacted: true,
        channel: params.channel,
        ts: params.ts,
        emoji: params.emoji,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async removeReaction(params: RemoveReactionParams): Promise<McpToolResult> {
    try {
      await this.slack.request<{ ok: boolean }>("reactions.remove", {
        channel: params.channel,
        timestamp: params.ts,
        name: params.emoji,
      });

      return this.ok({
        removed: true,
        channel: params.channel,
        ts: params.ts,
        emoji: params.emoji,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async createChannel(params: CreateChannelParams): Promise<McpToolResult> {
    try {
      const createRes = await this.slack.request<{
        ok: boolean;
        channel: { id: string; name: string; is_private: boolean };
      }>("conversations.create", {
        name: params.name,
        is_private: params.is_private,
      });

      const channelId = createRes.channel.id;
      const invited: Array<{ user: string; user_id: string }> = [];
      const inviteErrors: Array<{ user: string; error: string }> = [];

      if (params.invite_users && params.invite_users.length > 0) {
        const userIds: string[] = [];
        for (const identifier of params.invite_users) {
          try {
            const userId = await this.slack.resolveUserId(identifier);
            userIds.push(userId);
            invited.push({ user: identifier, user_id: userId });
          } catch (error) {
            inviteErrors.push({
              user: identifier,
              error: error instanceof Error ? error.message : "Could not resolve user",
            });
          }
        }

        if (userIds.length > 0) {
          try {
            await this.slack.request<{ ok: boolean }>("conversations.invite", {
              channel: channelId,
              users: userIds.join(","),
            });
          } catch (error) {
            inviteErrors.push({
              user: userIds.join(","),
              error: error instanceof Error ? error.message : "Failed to invite users",
            });
          }
        }
      }

      if (params.topic) {
        await this.slack.request<{ ok: boolean }>("conversations.setTopic", {
          channel: channelId,
          topic: params.topic,
        });
      }

      if (params.purpose) {
        await this.slack.request<{ ok: boolean }>("conversations.setPurpose", {
          channel: channelId,
          purpose: params.purpose,
        });
      }

      return this.ok({
        created: true,
        channel_id: channelId,
        name: createRes.channel.name,
        is_private: createRes.channel.is_private,
        invited,
        ...(inviteErrors.length > 0 && { invite_errors: inviteErrors }),
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async createGroupDm(params: CreateGroupDmParams): Promise<McpToolResult> {
    try {
      const resolved: Array<{ user: string; user_id: string }> = [];
      const resolveErrors: Array<{ user: string; error: string }> = [];

      for (const identifier of params.users) {
        try {
          const userId = await this.slack.resolveUserId(identifier);
          resolved.push({ user: identifier, user_id: userId });
        } catch (error) {
          resolveErrors.push({
            user: identifier,
            error: error instanceof Error ? error.message : "Could not resolve user",
          });
        }
      }

      if (resolved.length === 0) {
        return this.ok({
          created: false,
          error: "No users could be resolved",
          resolve_errors: resolveErrors,
        });
      }

      const openRes = await this.slack.request<{
        ok: boolean;
        channel: { id: string };
      }>("conversations.open", {
        users: resolved.map((r) => r.user_id).join(","),
      });

      const channelId = openRes.channel.id;
      let messageTs: string | null = null;

      if (params.message) {
        const mrkdwn = this.toMrkdwn(params.message);
        const blocks = this.buildBlocks(mrkdwn);
        const res = await this.slack.request<{ ok: boolean; ts: string }>("chat.postMessage", {
          channel: channelId,
          text: mrkdwn,
          blocks: JSON.stringify(blocks),
          unfurl_links: false,
          unfurl_media: false,
        });
        messageTs = res.ts;
      }

      return this.ok({
        created: true,
        channel_id: channelId,
        members: resolved,
        ...(messageTs && { message_ts: messageTs }),
        ...(resolveErrors.length > 0 && { resolve_errors: resolveErrors }),
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  async waitForReply(params: WaitForReplyParams, signal?: AbortSignal): Promise<McpToolResult> {
    try {
      const userId = await this.slack.resolveUserId(params.user);

      let channelId: string;
      if (params.channel) {
        channelId = await this.slack.resolveChannelId(params.channel);
      } else {
        channelId = await this.slack.openDm(userId);
      }

      const sinceTs = params.since_ts ?? (Date.now() / 1000).toFixed(6);
      const deadline = Date.now() + params.timeout_seconds * 1000;
      const pollMs = params.poll_interval_seconds * 1000;
      const method = params.thread_ts ? "conversations.replies" : "conversations.history";

      while (Date.now() < deadline) {
        if (signal?.aborted) {
          return this.ok({
            replied: false,
            cancelled: true,
            channel_id: channelId,
            waiting_for_user_id: userId,
          });
        }

        const requestParams: Record<string, unknown> = {
          channel: channelId,
          oldest: sinceTs,
          limit: 50,
        };
        if (params.thread_ts) requestParams.ts = params.thread_ts;

        const res = await this.slack.request<{
          ok: boolean;
          messages: SlackMessage[];
        }>(method, requestParams);

        const reply = res.messages
          .filter((m) => m.user === userId && m.ts > sinceTs)
          .sort((a, b) => Number(a.ts) - Number(b.ts))[0];

        if (reply) {
          return this.ok({
            replied: true,
            text: reply.text,
            ts: reply.ts,
            user_id: userId,
            channel_id: channelId,
            thread_ts: reply.thread_ts ?? null,
          });
        }

        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await this.sleep(Math.min(pollMs, remaining), signal);
      }

      return this.ok({
        replied: false,
        timed_out: true,
        channel_id: channelId,
        waiting_for_user_id: userId,
        waited_seconds: params.timeout_seconds,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
      }
    });
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
