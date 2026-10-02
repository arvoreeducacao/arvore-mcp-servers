import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { SlackAdvancedMCPError } from "./types.js";
import type { SlackFile } from "./types.js";
import { CONFIDENT_SCORE, EXACT_SCORE, rankUsers } from "./user-match.js";

const MAX_RETRIES = 3;
const SLACK_USER_ID = /^[UW][A-Z0-9]{6,}$/;
const SLACK_CONVERSATION_ID = /^[CDG][A-Z0-9]{6,}$/;
const SLACK_DM_ID = /^D[A-Z0-9]{6,}$/;
const SLACK_DM_LINK = /\/archives\/(D[A-Z0-9]{6,})(?:[/?#]|$)/;
const DISK_CACHE_VERSION = 2;
const MAX_EXTERNAL_LOOKUPS = 300;
const EXTERNAL_LOOKUP_CONCURRENCY = 5;

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

export function missingScopeError(method: string, needed?: unknown): SlackAdvancedMCPError {
  const scope = typeof needed === "string" && needed ? needed : "an extra";
  return new SlackAdvancedMCPError(
    `Slack API error: missing_scope. ${method} needs the ${scope} scope, which this token was not granted. Add ${scope} to the User Token Scopes of the Slack app, reinstall the app and update SLACK_USER_TOKEN`,
    "MISSING_SCOPE"
  );
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
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

export type CachedUser = {
  id: string;
  name: string;
  real_name: string;
  display_name: string;
  email: string;
  team_id?: string;
  external?: boolean;
  profile: Record<string, unknown>;
};

type SlackConversation = { id: string; user?: string; is_user_deleted?: boolean; is_ext_shared?: boolean };

type SlackMember = {
  id: string;
  name: string;
  team_id?: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  profile?: { display_name?: string; real_name?: string; email?: string; [key: string]: unknown };
};

function toCachedUser(member: SlackMember, external: boolean): CachedUser {
  return {
    id: member.id,
    name: member.name ?? "",
    real_name: member.real_name || member.profile?.real_name || "",
    display_name: member.profile?.display_name ?? "",
    email: member.profile?.email ?? "",
    team_id: member.team_id,
    ...(external && { external: true }),
    profile: member.profile ?? {},
  };
}

interface DiskCache {
  version?: number;
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
      if (data.version !== DISK_CACHE_VERSION) return;

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

      const data: DiskCache = { version: DISK_CACHE_VERSION, timestamp: Date.now(), users };
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

      if (!data.ok && data.error === "missing_scope") {
        throw missingScopeError(method, data.needed);
      }

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

    const members: CachedUser[] = [];
    let cursor: string | undefined;

    do {
      const params: Record<string, unknown> = { limit: 200 };
      if (cursor) params.cursor = cursor;

      const res = await this.request<{
        ok: boolean;
        members: SlackMember[];
        response_metadata?: { next_cursor?: string };
      }>("users.list", params);

      for (const m of res.members) {
        if (m.deleted || m.is_bot) continue;
        members.push(toCachedUser(m, false));
      }

      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);

    const external = await this.discoverExternalUsers(new Set(members.map((m) => m.id)));
    const users = [...members, ...external];

    this.usersCache = new Map(users.map((u) => [u.id, u]));
    this.usersCacheTimestamp = now;
    this.saveDiskCache(users);

    return users;
  }

  private async discoverExternalUsers(known: Set<string>): Promise<CachedUser[]> {
    const candidates = new Set<string>();

    for (const userId of await this.optionalSource("DM list", () => this.listDmPartners())) {
      candidates.add(userId);
    }

    const shared = await this.optionalSource("shared conversations", () => this.listSharedConversations());
    const memberLists = await mapWithConcurrency(shared, EXTERNAL_LOOKUP_CONCURRENCY, (conversationId) =>
      this.optionalSource(`members of ${conversationId}`, () => this.listMembers(conversationId))
    );
    for (const userId of memberLists.flat()) candidates.add(userId);

    const unknown = [...candidates].filter((id) => !known.has(id) && SLACK_USER_ID.test(id)).slice(0, MAX_EXTERNAL_LOOKUPS);
    const found = await mapWithConcurrency(unknown, EXTERNAL_LOOKUP_CONCURRENCY, (id) =>
      this.optionalSource(`users.info ${id}`, async () => {
        const res = await this.request<{ ok: boolean; user: SlackMember }>("users.info", { user: id });
        return res.user && !res.user.deleted && !res.user.is_bot ? [toCachedUser(res.user, true)] : [];
      })
    );

    if (unknown.length > 0) {
      console.error(`Found ${found.flat().length} Slack Connect users outside users.list`);
    }
    return found.flat();
  }

  private async optionalSource<T>(label: string, load: () => Promise<T[]>): Promise<T[]> {
    try {
      return await load();
    } catch (error) {
      console.error(`Skipping ${label} while looking for Slack Connect users: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private async listMyConversations(types: string): Promise<SlackConversation[]> {
    const conversations: SlackConversation[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.request<{
        ok: boolean;
        channels?: SlackConversation[];
        response_metadata?: { next_cursor?: string };
      }>("users.conversations", { types, exclude_archived: true, limit: 1000, cursor });
      conversations.push(...(res.channels ?? []));
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);
    return conversations;
  }

  private async listDmPartners(): Promise<string[]> {
    const dms = await this.listMyConversations("im");
    return dms.filter((dm) => dm.user && !dm.is_user_deleted).map((dm) => dm.user as string);
  }

  private async listSharedConversations(): Promise<string[]> {
    const conversations = await this.listMyConversations("public_channel,private_channel,mpim");
    return conversations.filter((c) => c.is_ext_shared).map((c) => c.id);
  }

  private async listMembers(conversationId: string): Promise<string[]> {
    const members: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.request<{
        ok: boolean;
        members?: string[];
        response_metadata?: { next_cursor?: string };
      }>("conversations.members", { channel: conversationId, limit: 1000, cursor });
      members.push(...(res.members ?? []));
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);
    return members;
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

    const ranked = rankUsers(await this.getAllUsers(), identifier);

    const exact = ranked.filter((r) => r.score === EXACT_SCORE).map((r) => r.user);
    if (exact.length === 1) return exact[0].id;
    if (exact.length > 1) throw this.ambiguousUser(identifier, exact);

    const partial = ranked.filter((r) => r.score >= CONFIDENT_SCORE).map((r) => r.user);
    if (partial.length === 1) return partial[0].id;
    if (partial.length > 1) throw this.ambiguousUser(identifier, partial);

    const closest = ranked.slice(0, 5).map((r) => this.describeUser(r.user));
    const hint = closest.length > 0
      ? ` Nothing was sent. Closest matches, retry with the user ID if one of them is the right person: ${JSON.stringify(closest)}`
      : " Nothing was sent. People from other organizations (Slack Connect) are found only when they share a channel or a DM with the user; pass their user ID or the DM id (D...) instead";
    throw new SlackAdvancedMCPError(`Could not resolve user: ${identifier}.${hint}`, "USER_NOT_FOUND");
  }

  async resolveDm(identifier: string): Promise<{ channelId: string; userId: string | null }> {
    const trimmed = identifier.trim();
    const dmId = SLACK_DM_ID.test(trimmed) ? trimmed : trimmed.match(SLACK_DM_LINK)?.[1];
    if (dmId) return { channelId: dmId, userId: null };

    const userId = await this.resolveUserId(trimmed);
    return { channelId: await this.openDm(userId), userId };
  }

  private describeUser(u: CachedUser): Record<string, unknown> {
    return {
      id: u.id,
      real_name: u.real_name,
      display_name: u.display_name,
      email: u.email,
      ...(u.external && { external: true }),
    };
  }

  private ambiguousUser(identifier: string, candidates: CachedUser[]): SlackAdvancedMCPError {
    const listed = candidates.slice(0, 10).map((u) => this.describeUser(u));
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

    const channels = res.channels ?? [];
    this.rememberChannels(channels);
    return { channels, nextCursor: res.response_metadata?.next_cursor || undefined };
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
        const isScopeError = error instanceof SlackAdvancedMCPError && error.code === "MISSING_SCOPE";
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
