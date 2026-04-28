import { slackifyMarkdown } from "slackify-markdown";
import { SlackClient } from "../slack-client.js";
import type {
  SendDmParams,
  GetDmHistoryParams,
  SendChannelMessageParams,
  EditMessageParams,
  DeleteMessageParams,
  AddReactionParams,
  RemoveReactionParams,
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
