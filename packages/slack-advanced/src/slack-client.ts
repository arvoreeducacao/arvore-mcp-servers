import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { SlackAdvancedMCPError } from "./types.js";
import type { SlackFile } from "./types.js";

const MAX_RETRIES = 3;
const SLACK_USER_ID = /^[UW][A-Z0-9]{6,}$/;
const SLACK_CONVERSATION_ID = /^[CDG][A-Z0-9]{6,}$/;

const NON_IDEMPOTENT_METHODS = new Set([
  "chat.postMessage",
  "chat.update",
  "chat.delete",
  "chat.scheduleMessage",
  "chat.deleteScheduledMessage",
  "reactions.add",
  "reactions.remove",
  "conversations.create",
  "conversations.invite",
  "conversations.setTopic",
  "conversations.setPurpose",
  "drafts.create",
  "files.completeUploadExternal",
]);

export function isSlackFileHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "slack.com" || host.endsWith(".slack.com") || host === "slack-edge.com" || host.endsWith(".slack-edge.com");
}

function assertSlackFileUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SlackAdvancedMCPError(`Invalid file URL: ${url}`, "UNTRUSTED_FILE_URL");
  }

  if (parsed.protocol !== "https:" || !isSlackFileHost(parsed.hostname)) {
    throw new SlackAdvancedMCPError(
      `Refusing to send the Slack token to ${parsed.host || url}: file URLs must be https on slack.com. Pass the file_id instead`,
      "UNTRUSTED_FILE_URL"
    );
  }
}

function describeNetworkError(error: unknown): string {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "timed out";
  }
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SlackChannel = {
  id: string;
  name: string;
  is_private?: boolean;
  is_archived?: boolean;
  is_member?: boolean;
  num_members?: number;
  topic?: { value?: string };
  purpose?: { value?: string };
};

export type SlackClientOptions = {
  requestTimeoutMs?: number;
  transferTimeoutMs?: number;
  retryBaseMs?: number;
  channelCacheTtlMinutes?: number;
};

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
  private readonly requestTimeoutMs: number;
  private readonly transferTimeoutMs: number;
  private readonly retryBaseMs: number;
  private readonly channelCacheTtlMs: number;
  private readonly channelIds = new Map<string, { id: string; expiresAt: number }>();

  constructor(token: string, cachePath?: string, cacheTtlMinutes?: number, options: SlackClientOptions = {}) {
    this.token = token;
    this.cachePath = cachePath ?? `${homedir()}/.slack-advanced-mcp/users_cache.json`;
    this.CACHE_TTL_MS = (cacheTtlMinutes ?? 240) * 60 * 1000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.transferTimeoutMs = options.transferTimeoutMs ?? 120_000;
    this.retryBaseMs = options.retryBaseMs ?? 1_000;
    this.channelCacheTtlMs = (options.channelCacheTtlMinutes ?? 60) * 60 * 1000;
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
    const retrySafe = !NON_IDEMPOTENT_METHODS.has(method);
    const body = params
      ? Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&")
      : undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const isLastAttempt = attempt === MAX_RETRIES;
      let res: Response;

      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
      } catch (error) {
        if (retrySafe && !isLastAttempt) {
          console.error(`Network error on ${method}, retrying (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await sleep(this.backoffMs(attempt));
          continue;
        }
        throw new SlackAdvancedMCPError(
          `Slack request ${method} failed: ${describeNetworkError(error)}${retrySafe ? "" : ". It may or may not have been applied; check before retrying"}`,
          "SLACK_NETWORK_ERROR"
        );
      }

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") ?? "5", 10);
        if (!isLastAttempt) {
          console.error(`Rate limited by Slack, waiting ${retryAfter + 1}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await sleep((retryAfter + 1) * 1000);
          continue;
        }
        throw new SlackAdvancedMCPError("Max retries exceeded for rate limit", "RATE_LIMIT_EXCEEDED", 429);
      }

      if (res.status >= 500 && retrySafe && !isLastAttempt) {
        console.error(`Slack HTTP ${res.status} on ${method}, retrying (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(this.backoffMs(attempt));
        continue;
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

    throw new SlackAdvancedMCPError(`Max retries exceeded for ${method}`, "RETRIES_EXHAUSTED");
  }

  private backoffMs(attempt: number): number {
    return this.retryBaseMs * 2 ** attempt;
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
    if (SLACK_USER_ID.test(identifier)) {
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
    const query = identifier.trim().toLowerCase().replace(/^@/, "");
    const fields = (u: CachedUser) => [u.name, u.real_name, u.display_name].map((f) => f.toLowerCase());

    const exact = users.filter((u) => fields(u).includes(query));
    if (exact.length === 1) return exact[0].id;
    if (exact.length > 1) throw this.ambiguousUser(identifier, exact);

    const partial = users.filter((u) => fields(u).some((f) => f.includes(query)));
    if (partial.length === 1) return partial[0].id;
    if (partial.length > 1) throw this.ambiguousUser(identifier, partial);

    throw new SlackAdvancedMCPError(
      `Could not resolve user: ${identifier}`,
      "USER_NOT_FOUND"
    );
  }

  private ambiguousUser(identifier: string, candidates: CachedUser[]): SlackAdvancedMCPError {
    const listed = candidates.slice(0, 10).map((u) => ({
      id: u.id,
      real_name: u.real_name,
      display_name: u.display_name,
      email: u.email,
    }));
    const more = candidates.length > listed.length ? ` (showing ${listed.length} of ${candidates.length})` : "";
    return new SlackAdvancedMCPError(
      `"${identifier}" matches more than one user${more}. Nothing was sent. Retry with the user ID or email of the right person: ${JSON.stringify(listed)}`,
      "AMBIGUOUS_USER"
    );
  }

  async listChannels(params: {
    types: string;
    excludeArchived: boolean;
    limit: number;
    cursor?: string;
  }): Promise<{ channels: SlackChannel[]; nextCursor?: string }> {
    const res = await this.request<{
      ok: boolean;
      channels: SlackChannel[];
      response_metadata?: { next_cursor?: string };
    }>("conversations.list", {
      types: params.types,
      exclude_archived: params.excludeArchived,
      limit: params.limit,
      cursor: params.cursor,
    });

    this.rememberChannels(res.channels);
    return { channels: res.channels, nextCursor: res.response_metadata?.next_cursor || undefined };
  }

  private rememberChannels(channels: Array<{ id: string; name?: string }>): void {
    const expiresAt = Date.now() + this.channelCacheTtlMs;
    for (const channel of channels) {
      if (channel.name) this.channelIds.set(channel.name, { id: channel.id, expiresAt });
    }
  }

  async resolveChannelId(identifier: string): Promise<string> {
    if (SLACK_CONVERSATION_ID.test(identifier)) {
      return identifier;
    }

    const name = identifier.trim().replace(/^#/, "").toLowerCase();

    const cached = this.channelIds.get(name);
    if (cached && cached.expiresAt > Date.now()) return cached.id;

    const channelTypes = ["public_channel", "private_channel"];

    for (const type of channelTypes) {
      try {
        let cursor: string | undefined;
        do {
          const page = await this.listChannels({ types: type, excludeArchived: true, limit: 1000, cursor });

          const match = page.channels.find((c) => c.name === name);
          if (match) return match.id;

          cursor = page.nextCursor;
        } while (cursor);
      } catch (error) {
        const isScopeError =
          error instanceof SlackAdvancedMCPError && error.message.includes("missing_scope");
        if (!isScopeError) throw error;
      }
    }

    throw new SlackAdvancedMCPError(
      `Could not resolve channel: ${identifier}. Tried public and private channel lists. Ensure the token has channels:read and/or groups:read scopes.`,
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
    assertSlackFileUrl(urlPrivate);

    let res: Response;
    try {
      res = await fetch(urlPrivate, {
        headers: { Authorization: `Bearer ${this.token}` },
        redirect: "manual",
        signal: AbortSignal.timeout(this.transferTimeoutMs),
      });
    } catch (error) {
      throw new SlackAdvancedMCPError(
        `Failed to download file: ${describeNetworkError(error)}`,
        "FILE_DOWNLOAD_ERROR"
      );
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new SlackAdvancedMCPError(`File download redirected without a location (${res.status})`, "FILE_DOWNLOAD_ERROR", res.status);
      }
      const target = new URL(location, urlPrivate).toString();
      assertSlackFileUrl(target);
      return this.downloadFile(target);
    }

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

  async uploadFile(params: {
    channelId: string;
    fileBuffer: Buffer;
    filename: string;
    initialComment?: string;
    threadTs?: string;
  }): Promise<{ fileId: string; permalink: string }> {
    const { channelId, fileBuffer, filename, initialComment, threadTs } = params;

    const uploadUrlRes = await this.request<{
      ok: boolean;
      upload_url: string;
      file_id: string;
    }>("files.getUploadURLExternal", {
      filename,
      length: fileBuffer.length,
    });

    await this.sendUploadBytes(uploadUrlRes.upload_url, fileBuffer);

    const fileObj: Record<string, unknown> = { id: uploadUrlRes.file_id };
    if (initialComment) fileObj.title = filename;

    const completeParams: Record<string, unknown> = {
      files: JSON.stringify([fileObj]),
      channel_id: channelId,
    };

    if (initialComment) completeParams.initial_comment = initialComment;
    if (threadTs) completeParams.thread_ts = threadTs;

    const completeRes = await this.request<{
      ok: boolean;
      files: Array<{ id: string; permalink: string }>;
    }>("files.completeUploadExternal", completeParams);

    const file = completeRes.files?.[0];
    return {
      fileId: file?.id ?? uploadUrlRes.file_id,
      permalink: file?.permalink ?? "",
    };
  }

  private async sendUploadBytes(uploadUrl: string, fileBuffer: Buffer): Promise<void> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const isLastAttempt = attempt === MAX_RETRIES;
      try {
        const res = await fetch(uploadUrl, {
          method: "POST",
          body: new Uint8Array(fileBuffer),
          signal: AbortSignal.timeout(this.transferTimeoutMs),
        });

        if (res.ok) return;

        if ((res.status >= 500 || res.status === 429) && !isLastAttempt) {
          await sleep(this.backoffMs(attempt));
          continue;
        }

        throw new SlackAdvancedMCPError(
          `Failed to upload file to Slack (${res.status})`,
          "FILE_UPLOAD_ERROR",
          res.status
        );
      } catch (error) {
        if (error instanceof SlackAdvancedMCPError) throw error;
        if (!isLastAttempt) {
          await sleep(this.backoffMs(attempt));
          continue;
        }
        throw new SlackAdvancedMCPError(
          `Failed to upload file to Slack: ${describeNetworkError(error)}`,
          "FILE_UPLOAD_ERROR"
        );
      }
    }
  }

  async getUserInfo(userId: string): Promise<Record<string, unknown>> {
    const res = await this.request<{
      ok: boolean;
      user: Record<string, unknown>;
    }>("users.info", { user: userId, include_locale: true });
    return res.user;
  }

  async getUserPresence(userId: string): Promise<string> {
    try {
      const res = await this.request<{
        ok: boolean;
        presence: string;
      }>("users.getPresence", { user: userId });
      return res.presence;
    } catch {
      return "unknown";
    }
  }

  parseThreadLink(url: string): { channelId: string; threadTs: string; messageTs: string } | null {
    const match = url.match(/archives\/([A-Z0-9]+)\/p(\d{16})/);
    if (!match) return null;

    const channelId = match[1];
    const rawTs = match[2];
    const messageTs = `${rawTs.slice(0, 10)}.${rawTs.slice(10)}`;

    const threadTsParam = url.match(/[?&]thread_ts=(\d+\.\d+)/);
    const threadTs = threadTsParam ? threadTsParam[1] : messageTs;

    return { channelId, threadTs, messageTs };
  }
}
