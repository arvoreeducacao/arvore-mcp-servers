import type { SlackClient } from "./slack-client.js";
import type {
  McpToolResult,
  OpenThreadParams,
  ReplyToThreadParams,
  ReadThreadParams,
  ListThreadsParams,
  FindThreadParams,
  SlackConfig,
} from "./types.js";
import { renderTemplate } from "./template.js";

export class AgentTeamsChatTools {
  private client: SlackClient;
  private identity: string;
  private messageTemplate: string;

  constructor(client: SlackClient, config: SlackConfig) {
    this.client = client;
    this.identity = config.agentIdentity;
    this.messageTemplate = config.messageTemplate;
  }

  private formatMessage(message: string): string {
    return renderTemplate(this.messageTemplate, {
      identity: this.identity,
      message,
    });
  }

  async openThread(params: OpenThreadParams): Promise<McpToolResult> {
    try {
      const body = params.message
        ? `${this.formatMessage(params.message)}`
        : this.formatMessage(params.topic);

      const topicLine = params.message
        ? `*Thread:* ${params.topic}\n\n${body}`
        : body;

      const result = await this.client.postMessage(topicLine);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            thread_ts: result.ts,
            channel: result.channel,
            topic: params.topic,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to open thread: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }

  async replyToThread(params: ReplyToThreadParams): Promise<McpToolResult> {
    try {
      const formatted = this.formatMessage(params.message);
      const result = await this.client.postMessage(formatted, params.thread_ts);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ts: result.ts,
            thread_ts: params.thread_ts,
            delivered: true,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to reply: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }

  async readThread(params: ReadThreadParams): Promise<McpToolResult> {
    try {
      const messages = await this.client.getThreadReplies(
        params.thread_ts,
        params.limit,
        params.since,
      );

      const formatted = messages.map((msg) => ({
        ts: msg.ts,
        user: msg.user,
        text: msg.text,
        is_bot: !!msg.botId,
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            thread_ts: params.thread_ts,
            message_count: formatted.length,
            messages: formatted,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to read thread: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }

  async listThreads(params: ListThreadsParams): Promise<McpToolResult> {
    try {
      const history = await this.client.getChannelHistory(params.limit ?? 10);
      const threads = await this.client.getThreadInfo(history);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            channel_threads: threads.length,
            threads,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to list threads: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }

  async findThread(params: FindThreadParams): Promise<McpToolResult> {
    try {
      const matches = await this.client.searchMessages(params.query);

      const results = matches.map((msg) => ({
        ts: msg.ts,
        thread_ts: msg.threadTs,
        text: msg.text,
        user: msg.user,
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query: params.query,
            match_count: results.length,
            matches: results,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to find thread: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
}
