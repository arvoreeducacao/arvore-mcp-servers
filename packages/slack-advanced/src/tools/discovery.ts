import { SlackClient } from "../slack-client.js";
import type { ListChannelsParams, McpToolResult, SearchMessagesParams } from "../types.js";
import { toolError, toolOk } from "./result.js";

type SearchMatch = {
  ts: string;
  text: string;
  user?: string;
  username?: string;
  permalink: string;
  channel: { id: string; name: string };
};

export class DiscoveryTools {
  constructor(private readonly slack: SlackClient) {}

  async searchMessages(params: SearchMessagesParams): Promise<McpToolResult> {
    try {
      const res = await this.slack.request<{
        ok: boolean;
        messages: {
          total: number;
          matches: SearchMatch[];
          paging?: { page: number; pages: number };
        };
      }>("search.messages", {
        query: params.query,
        sort: params.sort,
        sort_dir: params.sort_dir,
        count: params.count,
        page: params.page,
      });

      const paging = res.messages.paging;

      return toolOk({
        query: params.query,
        total: res.messages.total,
        page: paging?.page ?? params.page,
        pages: paging?.pages ?? 1,
        matches: res.messages.matches.map((m) => ({
          channel_id: m.channel.id,
          channel_name: m.channel.name,
          user_id: m.user ?? null,
          user_name: m.username ?? null,
          text: m.text,
          ts: m.ts,
          permalink: m.permalink,
        })),
      });
    } catch (error) {
      return toolError(error);
    }
  }

  async listChannels(params: ListChannelsParams): Promise<McpToolResult> {
    try {
      const page = await this.slack.listChannels({
        types: params.types.join(","),
        excludeArchived: params.exclude_archived,
        limit: params.limit,
        cursor: params.cursor,
      });

      const needle = params.name_contains?.toLowerCase();
      const channels = needle
        ? page.channels.filter((c) => c.name?.toLowerCase().includes(needle))
        : page.channels;

      return toolOk({
        channels: channels.map((c) => ({
          id: c.id,
          name: c.name ?? null,
          is_private: c.is_private ?? false,
          is_archived: c.is_archived ?? false,
          is_member: c.is_member ?? false,
          num_members: c.num_members ?? null,
          topic: c.topic?.value || null,
          purpose: c.purpose?.value || null,
        })),
        next_cursor: page.nextCursor ?? null,
      });
    } catch (error) {
      return toolError(error);
    }
  }
}
