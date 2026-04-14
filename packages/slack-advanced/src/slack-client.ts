import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { SlackAdvancedMCPError } from "./types.js";
import type { SlackFile } from "./types.js";

type CachedUser = { id: string; name: string; real_name: string; display_name: string; email: string; profile: Record<string, unknown> };

interface DiskCache {
  timestamp: number;
  users: CachedUser[];
}

export class SlackClient {
  private readonly baseUrl = "https://slack.com/api";
  private readonly token: string;
  private usersCache: Map<string, CachedUser> | null = null;
  private usersCacheTimestamp = 0;
  private readonly CACHE_TTL_MS: number;
  private readonly cachePath: string;

  constructor(token: string, cachePath?: string, cacheTtlMinutes?: number) {
    this.token = token;
    this.cachePath = cachePath ?? `${homedir()}/.slack-advanced-mcp/users_cache.json`;
    this.CACHE_TTL_MS = (cacheTtlMinutes ?? 240) * 60 * 1000;
    this.loadDiskCache();
  }

  private loadDiskCache(): void {
    try {
      if (!existsSync(this.cachePath)) return;

      const stat = statSync(this.cachePath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > this.CACHE_TTL_MS) {
        console.error(`Users cache expired (${Math.round(ageMs / 60000)}min old), will refresh on next request`);
        return;
      }

      const raw = readFileSync(this.cachePath, "utf-8");
      const data = JSON.parse(raw) as DiskCache;

      this.usersCache = new Map(data.users.map((u) => [u.id, u]));
      this.usersCacheTimestamp = data.timestamp;
      console.error(`Loaded ${data.users.length} users from disk cache`);
    } catch {
      console.error("Failed to load users cache from disk, will fetch fresh");
    }
  }

  private saveDiskCache(users: CachedUser[]): void {
    try {
      const dir = dirname(this.cachePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data: DiskCache = { timestamp: Date.now(), users };
      writeFileSync(this.cachePath, JSON.stringify(data), "utf-8");
      console.error(`Saved ${users.length} users to disk cache`);
    } catch (err) {
      console.error("Failed to save users cache to disk:", err);
    }
  }

  async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/${method}`;
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const body = params
        ? Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join("&")
        : undefined;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") ?? "5", 10);
        const waitMs = (retryAfter + 1) * 1000;
        if (attempt < maxRetries) {
          console.error(`Rate limited by Slack, waiting ${retryAfter + 1}s (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
      }

      if (!res.ok) {
        throw new SlackAdvancedMCPError(
          `Slack HTTP error (${res.status}): ${await res.text()}`,
          "SLACK_HTTP_ERROR",
          res.status
        );
      }

      const data = (await res.json()) as Record<string, unknown> & { ok: boolean; error?: string };

      if (!data.ok) {
        throw new SlackAdvancedMCPError(
          `Slack API error: ${data.error ?? "unknown"}`,
          "SLACK_API_ERROR"
        );
      }

      return data as T;
    }

    throw new SlackAdvancedMCPError("Max retries exceeded for rate limit", "RATE_LIMIT_EXCEEDED");
  }

  async getAllUsers(): Promise<CachedUser[]> {
    const now = Date.now();
    if (this.usersCache && now - this.usersCacheTimestamp < this.CACHE_TTL_MS) {
      return Array.from(this.usersCache.values());
    }

    const users: CachedUser[] = [];
    let cursor: string | undefined;

    do {
      const params: Record<string, unknown> = { limit: 200 };
      if (cursor) params.cursor = cursor;

      const res = await this.request<{
        ok: boolean;
        members: Array<{
          id: string;
          name: string;
          real_name?: string;
          deleted?: boolean;
          is_bot?: boolean;
          profile?: { display_name?: string; email?: string; [key: string]: unknown };
        }>;
        response_metadata?: { next_cursor?: string };
      }>("users.list", params);

      for (const m of res.members) {
        if (m.deleted || m.is_bot) continue;
        users.push({
          id: m.id,
          name: m.name,
          real_name: m.real_name ?? "",
          display_name: m.profile?.display_name ?? "",
          email: m.profile?.email ?? "",
          profile: m.profile ?? {},
        });
      }

      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);

    this.usersCache = new Map(users.map((u) => [u.id, u]));
    this.usersCacheTimestamp = now;
    this.saveDiskCache(users);

    return users;
  }

  async resolveUserId(identifier: string): Promise<string> {
    if (identifier.startsWith("U") && /^U[A-Z0-9]+$/.test(identifier)) {
      return identifier;
    }

    if (identifier.includes("@")) {
      const res = await this.request<{ ok: boolean; user: { id: string } }>(
        "users.lookupByEmail",
        { email: identifier }
      );
      return res.user.id;
    }

    const users = await this.getAllUsers();
    const query = identifier.toLowerCase();

    const match = users.find(
      (u) =>
        u.name.toLowerCase() === query ||
        u.real_name.toLowerCase() === query ||
        u.display_name.toLowerCase() === query
    );

    if (match) return match.id;

    const fuzzy = users.find(
      (u) =>
        u.name.toLowerCase().includes(query) ||
        u.real_name.toLowerCase().includes(query) ||
        u.display_name.toLowerCase().includes(query)
    );

    if (fuzzy) return fuzzy.id;

    throw new SlackAdvancedMCPError(
      `Could not resolve user: ${identifier}`,
      "USER_NOT_FOUND"
    );
  }

  async resolveChannelId(identifier: string): Promise<string> {
    if (/^[A-Z0-9]+$/.test(identifier)) {
      return identifier;
    }

    const name = identifier.replace(/^#/, "");

    let cursor: string | undefined;
    do {
      const params: Record<string, unknown> = { limit: 200, types: "public_channel,private_channel" };
      if (cursor) params.cursor = cursor;

      const res = await this.request<{
        ok: boolean;
        channels: Array<{ id: string; name: string }>;
        response_metadata?: { next_cursor?: string };
      }>("conversations.list", params);

      const match = res.channels.find((c) => c.name === name);
      if (match) return match.id;

      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);

    throw new SlackAdvancedMCPError(
      `Could not resolve channel: ${identifier}`,
      "CHANNEL_NOT_FOUND"
    );
  }

  async openDm(userId: string): Promise<string> {
    const res = await this.request<{
      ok: boolean;
      channel: { id: string };
    }>("conversations.open", { users: userId });
    return res.channel.id;
  }

  async downloadFile(urlPrivate: string): Promise<Buffer> {
    const res = await fetch(urlPrivate, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    if (!res.ok) {
      throw new SlackAdvancedMCPError(
        `Failed to download file (${res.status})`,
        "FILE_DOWNLOAD_ERROR",
        res.status
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getFileInfo(fileId: string): Promise<SlackFile> {
    const res = await this.request<{
      ok: boolean;
      file: SlackFile;
    }>("files.info", { file: fileId });
    return res.file;
  }

  parseThreadLink(url: string): { channelId: string; threadTs: string } | null {
    const match = url.match(/archives\/([A-Z0-9]+)\/p(\d+)/);
    if (!match) return null;

    const channelId = match[1];
    const rawTs = match[2];
    const threadTs = `${rawTs.slice(0, 10)}.${rawTs.slice(10)}`;

    return { channelId, threadTs };
  }
}
