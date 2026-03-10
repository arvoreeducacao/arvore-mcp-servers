import type { SlackConfig, SlackMessage, ThreadInfo } from "./types.js";

const SLACK_API_BASE = "https://slack.com/api";

export class SlackClient {
  private botToken: string;
  private channel: string;

  constructor(config: SlackConfig) {
    this.botToken = config.botToken;
    this.channel = config.channel;
  }

  private async request<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${SLACK_API_BASE}/${method}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as Record<string, unknown>;

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error as string}`);
    }

    return data as T;
  }

  async postMessage(text: string, threadTs?: string): Promise<{ ts: string; channel: string }> {
    const body: Record<string, unknown> = {
      channel: this.channel,
      text,
      unfurl_links: false,
      unfurl_media: false,
    };

    if (threadTs) {
      body.thread_ts = threadTs;
    }

    const result = await this.request<{ ts: string; channel: string }>("chat.postMessage", body);
    return { ts: result.ts, channel: result.channel };
  }

  async getThreadReplies(threadTs: string, limit = 50, oldest?: string): Promise<SlackMessage[]> {
    const body: Record<string, unknown> = {
      channel: this.channel,
      ts: threadTs,
      limit,
      inclusive: true,
    };

    if (oldest) {
      body.oldest = oldest;
    }

    const result = await this.request<{ messages: SlackMessage[] }>(
      "conversations.replies",
      body,
    );

    return result.messages ?? [];
  }

  async getChannelHistory(limit = 50): Promise<SlackMessage[]> {
    const result = await this.request<{ messages: SlackMessage[] }>(
      "conversations.history",
      {
        channel: this.channel,
        limit,
      },
    );

    return result.messages ?? [];
  }

  async searchMessages(query: string): Promise<SlackMessage[]> {
    const response = await fetch(`${SLACK_API_BASE}/search.messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.botToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        query: `in:<#${this.channel}> ${query}`,
        sort: "timestamp",
        sort_dir: "desc",
        count: "20",
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack search error: ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;

    if (!data.ok) {
      throw new Error(`Slack search error: ${data.error as string}`);
    }

    const messages = data.messages as { matches?: SlackMessage[] } | undefined;
    return messages?.matches ?? [];
  }

  async getThreadInfo(messages: SlackMessage[]): Promise<ThreadInfo[]> {
    const threads: ThreadInfo[] = [];

    for (const msg of messages) {
      if (msg.threadTs || !msg.ts) continue;

      const replyCount = (msg as unknown as { reply_count?: number }).reply_count ?? 0;
      const latestReply = (msg as unknown as { latest_reply?: string }).latest_reply;
      const replyUsers = (msg as unknown as { reply_users?: string[] }).reply_users ?? [];

      threads.push({
        ts: msg.ts,
        topic: msg.text,
        lastReply: latestReply,
        replyCount,
        participants: replyUsers,
      });
    }

    return threads;
  }
}
