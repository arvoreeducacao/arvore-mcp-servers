import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import {
  Browsers,
  BufferJSON,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  makeWASocket,
  normalizeMessageContent,
  proto,
  toNumber,
  useMultiFileAuthState,
  WAMessageStubType,
  type Chat,
  type Contact,
  type GroupMetadata,
  type WAMessage,
  type WAMessageContent,
  type WASocket,
} from "baileys";
import pino from "pino";
import { MessageStore, type Direction } from "./db.js";
import { parseContent } from "./message-content.js";
import { renderQrToAsciiString, renderQrToDataUrl, renderQrToPng, renderQrToTerminal } from "./qr.js";
import { getAuthDir, getDataRoot, getQrPngPath } from "./paths.js";
import { stripJidSuffix, toJid } from "./jid.js";

export type ConnectionState = "connecting" | "open" | "close" | "qr";

export type StatusInfo = {
  state: ConnectionState;
  phone: string | null;
  qr: string | null;
  qrAscii: string | null;
  qrPngPath: string | null;
  qrDataUrl: string | null;
};

export type SendOptions = {
  quotedMessageId?: string;
};

export type HistorySyncInfo = {
  chunks: number;
  messagesReceived: number;
  messagesStored: number;
  lastChunkAt: string;
  lastSyncType: string | null;
  lastProgress: number | null;
  phases: Record<string, "complete" | "paused">;
};

type PersistOptions = {
  historical?: boolean;
};

export type FetchHistoryResult = {
  requestId: string;
  anchorMessageId: string;
  anchorTimestamp: number;
  requested: number;
  note: string;
};

export type DownloadedMedia = {
  messageId: string;
  path: string;
  mimetype: string;
  mediaType: string;
  bytes: number;
  buffer: Buffer;
};

export type GroupInfo = {
  jid: string;
  subject: string;
  description: string | null;
  createdAt: string | null;
  size: number;
  participants: Array<{ jid: string; name: string | null; admin: string | null }>;
};

export type WhatsAppClientOptions = {
  root?: string;
  store?: MessageStore;
  label?: string;
  renderTerminalQr?: boolean;
};

const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || "warn" });

export class WhatsAppClient {
  readonly store: MessageStore;
  private readonly root: string;
  private readonly label: string;
  private readonly renderTerminalQr: boolean;
  private readonly groups = new Map<string, GroupMetadata>();
  private sock: WASocket | null = null;
  private state: ConnectionState = "close";
  private phone: string | null = null;
  private qr: string | null = null;
  private qrAscii: string | null = null;
  private qrPngPath: string | null = null;
  private qrDataUrl: string | null = null;
  private historySync: HistorySyncInfo | null = null;
  private connectingPromise: Promise<void> | null = null;
  private resolveConnecting: (() => void) | null = null;
  private rejectConnecting: ((err: Error) => void) | null = null;

  constructor(options: WhatsAppClientOptions = {}) {
    this.root = options.root ?? getDataRoot();
    this.store = options.store ?? new MessageStore(this.root);
    this.label = options.label ?? "default";
    this.renderTerminalQr = options.renderTerminalQr ?? true;
  }

  hasAuthState(): boolean {
    return existsSync(join(getAuthDir(this.root), "creds.json"));
  }

  isConnected(): boolean {
    return this.state === "open" && this.sock !== null;
  }

  getStatus(): StatusInfo {
    return {
      state: this.state,
      phone: this.phone,
      qr: this.qr,
      qrAscii: this.qrAscii,
      qrPngPath: this.qrPngPath,
      qrDataUrl: this.qrDataUrl,
    };
  }

  async connect(): Promise<StatusInfo> {
    if (this.state === "open" || this.state === "connecting" || this.state === "qr") {
      return this.getStatus();
    }
    this.state = "connecting";
    try {
      await this.startSocket();
    } catch (error) {
      this.state = "close";
      throw error;
    }
    return this.getStatus();
  }

  async waitForOpen(timeoutMs = 60_000): Promise<StatusInfo> {
    if (this.state === "open") return this.getStatus();
    if (!this.connectingPromise) {
      await this.connect();
    }

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out waiting for WhatsApp connection")), timeoutMs)
    );

    await Promise.race([this.connectingPromise!, timeout]);
    return this.getStatus();
  }

  async disconnect(): Promise<void> {
    if (!this.sock) return;
    try {
      this.sock.end(undefined);
    } catch {
      // ignore
    }
    this.sock = null;
    this.state = "close";
  }

  async logout(): Promise<void> {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch {
        // ignore
      }
      this.sock.end(undefined);
      this.sock = null;
    }
    this.state = "close";
    this.phone = null;
    this.qr = null;
    this.qrAscii = null;
    this.qrPngPath = null;
    this.qrDataUrl = null;
    this.clearAuthDir();
  }

  private clearAuthDir(): void {
    const dir = getAuthDir(this.root);
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        rmSync(path, { recursive: true, force: true });
      } else {
        unlinkSync(path);
      }
    }
  }

  async sendText(to: string, text: string, opts: SendOptions = {}): Promise<{ id: string; jid: string }> {
    const sock = this.requireSocket();
    const jid = await this.resolveSendJid(to);

    const payload: Record<string, unknown> = { text };
    if (opts.quotedMessageId) {
      payload.quoted = {
        key: { remoteJid: jid, id: opts.quotedMessageId, fromMe: false },
        message: {},
      };
    }

    const sent = await sock.sendMessage(jid, payload as never);
    const id = sent?.key?.id || `out-${Date.now()}`;

    this.store.saveMessage({
      id,
      jid: this.canonical(jid) ?? jid,
      senderJid: this.ownJid(),
      direction: "out",
      body: text,
      mediaType: null,
      mediaMimetype: null,
      mediaPath: null,
      pushName: null,
      quotedMessageId: opts.quotedMessageId ?? null,
      timestamp: Math.floor(Date.now() / 1000),
      raw: sent ? serialize(sent) : null,
    });

    return { id, jid };
  }

  async sendMedia(args: {
    to: string;
    buffer: Buffer;
    mimetype: string;
    mediaType: "image" | "audio" | "document" | "video";
    caption?: string;
    ptt?: boolean;
    filename?: string;
    quotedMessageId?: string;
  }): Promise<{ id: string; jid: string }> {
    const sock = this.requireSocket();
    const jid = await this.resolveSendJid(args.to);

    let payload: Record<string, unknown>;
    let bodyLabel: string;

    if (args.mediaType === "audio") {
      payload = {
        audio: args.buffer,
        mimetype: args.mimetype,
        ptt: args.ptt ?? true,
      };
      bodyLabel = "[audio]";
    } else if (args.mediaType === "image") {
      payload = {
        image: args.buffer,
        mimetype: args.mimetype,
        caption: args.caption,
      };
      bodyLabel = args.caption ? `[image] ${args.caption}` : "[image]";
    } else if (args.mediaType === "video") {
      payload = {
        video: args.buffer,
        mimetype: args.mimetype,
        caption: args.caption,
      };
      bodyLabel = args.caption ? `[video] ${args.caption}` : "[video]";
    } else {
      payload = {
        document: args.buffer,
        mimetype: args.mimetype,
        fileName: args.filename ?? "file",
        caption: args.caption,
      };
      bodyLabel = args.caption ? `[document] ${args.caption}` : "[document]";
    }

    if (args.quotedMessageId) {
      payload.quoted = {
        key: { remoteJid: jid, id: args.quotedMessageId, fromMe: false },
        message: {},
      };
    }

    const sent = await sock.sendMessage(jid, payload as never);
    const id = sent?.key?.id || `out-${Date.now()}`;

    this.store.saveMessage({
      id,
      jid: this.canonical(jid) ?? jid,
      senderJid: this.ownJid(),
      direction: "out",
      body: bodyLabel,
      mediaType: args.mediaType,
      mediaMimetype: args.mimetype,
      mediaPath: null,
      pushName: null,
      quotedMessageId: args.quotedMessageId ?? null,
      timestamp: Math.floor(Date.now() / 1000),
      raw: sent ? serialize(sent) : null,
    });

    return { id, jid };
  }

  async sendReaction(args: {
    to: string;
    targetMessageId: string;
    emoji: string;
    fromMe?: boolean;
  }): Promise<void> {
    const sock = this.requireSocket();
    const jid = await this.resolveSendJid(args.to);

    await sock.sendMessage(jid, {
      react: {
        text: args.emoji,
        key: { remoteJid: jid, id: args.targetMessageId, fromMe: args.fromMe ?? false },
      },
    });
  }

  async markRead(messageIds: string[], jid: string): Promise<void> {
    const sock = this.requireSocket();
    const keys = messageIds.map((id) => ({ remoteJid: jid, id, fromMe: false }));
    await sock.readMessages(keys);
  }

  async editMessage(jid: string, messageId: string, newText: string): Promise<void> {
    const sock = this.requireSocket();
    await sock.sendMessage(jid, {
      text: newText,
      edit: { remoteJid: jid, id: messageId, fromMe: true },
    });
    this.store.editMessage(messageId, newText, Math.floor(Date.now() / 1000));
  }

  async deleteMessage(jid: string, messageId: string, fromMe = true): Promise<void> {
    const sock = this.requireSocket();
    await sock.sendMessage(jid, {
      delete: { remoteJid: jid, id: messageId, fromMe },
    });
    this.store.markDeleted(messageId, Math.floor(Date.now() / 1000));
  }

  async resolveJid(input: string): Promise<{ input: string; jid: string | null; exists: boolean }> {
    const sock = this.requireSocket();
    const candidate = toJid(input);

    try {
      const result = await sock.onWhatsApp(candidate);
      const first = result?.[0];
      if (first?.exists) {
        return { input, jid: first.jid, exists: true };
      }
    } catch {
      // ignore
    }

    return { input, jid: candidate, exists: false };
  }

  async downloadMedia(messageId: string): Promise<DownloadedMedia> {
    const message = this.store.findMessage(messageId);
    if (!message) throw new Error(`Message ${messageId} is not stored.`);
    if (!message.mediaType) throw new Error(`Message ${messageId} has no media.`);

    const mimetype = message.mediaMimetype ?? "application/octet-stream";
    if (message.mediaPath && existsSync(message.mediaPath)) {
      const buffer = readFileSync(message.mediaPath);
      return { messageId, path: message.mediaPath, mimetype, mediaType: message.mediaType, bytes: buffer.length, buffer };
    }

    const raw = this.store.findRaw(messageId);
    if (!raw) {
      throw new Error(
        `The media keys of ${messageId} were not kept, so it cannot be downloaded. Only media received after this version can be.`
      );
    }

    const waMessage = JSON.parse(raw, BufferJSON.reviver) as WAMessage;
    const sock = this.sock;
    const buffer = await downloadMediaMessage(
      waMessage,
      "buffer",
      {},
      sock ? { logger: logger as never, reuploadRequest: sock.updateMediaMessage } : undefined
    );

    const dir = join(this.root, "media");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${messageId.replace(/[^A-Za-z0-9_-]/g, "_")}${mediaExtension(waMessage, mimetype)}`);
    writeFileSync(path, buffer);
    this.store.setMediaPath(messageId, path);

    return { messageId, path, mimetype, mediaType: message.mediaType, bytes: buffer.length, buffer };
  }

  async groupInfo(jid: string): Promise<GroupInfo> {
    const sock = this.requireSocket();
    const meta = await sock.groupMetadata(jid);
    this.rememberGroup(meta);

    return {
      jid: meta.id,
      subject: meta.subject,
      description: meta.desc ?? null,
      createdAt: meta.creation ? new Date(meta.creation * 1000).toISOString() : null,
      size: meta.size ?? meta.participants.length,
      participants: meta.participants.map((participant) => {
        const participantJid =
          this.canonical(participant.id, participant.phoneNumber ?? participant.lid ?? null) ?? participant.id;
        return {
          jid: participantJid,
          name: this.store.contactName(participantJid),
          admin: participant.admin ?? null,
        };
      }),
    };
  }

  private requireSocket(): WASocket {
    if (!this.sock || this.state !== "open") {
      throw new Error(
        `WhatsApp not connected (state=${this.state}). Call the connect tool and scan the QR code first.`
      );
    }
    return this.sock;
  }

  private async resolveSendJid(input: string): Promise<string> {
    const sock = this.requireSocket();
    if (input.endsWith("@g.us") || input.endsWith("@newsletter")) return input;
    if (input.endsWith("@lid")) return input;

    const candidate = toJid(input);
    try {
      const result = await sock.onWhatsApp(candidate);
      const first = result?.[0];
      if (first?.exists) return first.jid;
    } catch {
      // ignore — fall back
    }
    return candidate;
  }

  private ownJid(): string | null {
    return this.phone ? `${this.phone}@s.whatsapp.net` : null;
  }

  private canonical(jid: string | null | undefined, alt?: string | null): string | null {
    if (!jid) return null;
    const primary = jidNormalizedUser(jid);
    const secondary = alt ? jidNormalizedUser(alt) : null;

    if (isLidUser(primary)) {
      if (secondary && isPnUser(secondary)) {
        this.store.saveLidMapping(primary, secondary);
        return secondary;
      }
      return this.store.pnForLid(primary) ?? primary;
    }

    if (secondary && isLidUser(secondary) && isPnUser(primary)) {
      this.store.saveLidMapping(secondary, primary);
    }
    return primary;
  }

  private storedMessage(id: string | null | undefined): WAMessageContent | undefined {
    if (!id) return undefined;
    const raw = this.store.findRaw(id);
    if (!raw) return undefined;
    return (JSON.parse(raw, BufferJSON.reviver) as WAMessage).message ?? undefined;
  }

  private rememberGroup(meta: GroupMetadata): void {
    this.groups.set(meta.id, meta);
    if (meta.subject) this.store.setChatName(meta.id, meta.subject, true);
  }

  private saveContact(contact: Partial<Contact>): void {
    if (!contact.id || contact.id.endsWith("@g.us")) return;
    const id = jidNormalizedUser(contact.id);
    const lid = contact.lid ? jidNormalizedUser(contact.lid) : isLidUser(id) ? id : null;
    const pn = contact.phoneNumber ? jidNormalizedUser(contact.phoneNumber) : isPnUser(id) ? id : null;

    if (lid && pn) this.store.saveLidMapping(lid, pn);
    const jid = pn ?? (lid ? (this.store.pnForLid(lid) ?? lid) : id);

    this.store.upsertContact({
      jid,
      name: contact.name ?? null,
      pushName: contact.notify ?? contact.verifiedName ?? null,
      phone: isPnUser(jid) ? stripJidSuffix(jid) : null,
      lid: lid ? stripJidSuffix(lid) : null,
    });
  }

  private saveHistoryChat(chat: Chat): void {
    if (!chat.id) return;
    const jid = this.canonical(chat.id, chat.pnJid ?? chat.lidJid ?? null);
    if (!jid) return;
    if (typeof chat.unreadCount === "number") this.store.setUnread(jid, chat.unreadCount);
    if (!chat.name) return;
    if (jid.endsWith("@g.us")) {
      this.store.setChatName(jid, chat.name, true);
    } else {
      this.store.upsertContact({ jid, name: chat.name, phone: isPnUser(jid) ? stripJidSuffix(jid) : null });
    }
  }

  private applyUnread(chats: Array<Partial<Chat>>, absolute: boolean): void {
    for (const chat of chats) {
      if (!chat.id || typeof chat.unreadCount !== "number") continue;
      const jid = this.canonical(chat.id) ?? chat.id;
      if (absolute || chat.unreadCount === 0) this.store.setUnread(jid, chat.unreadCount);
      else if (chat.unreadCount > 0) this.store.addUnread(jid, chat.unreadCount);
      else this.store.markChatUnread(jid);
    }
  }

  private async startSocket(): Promise<void> {
    this.state = "connecting";
    this.qr = null;
    this.qrAscii = null;
    this.qrPngPath = null;
    this.qrDataUrl = null;

    const { state, saveCreds } = await useMultiFileAuthState(getAuthDir(this.root));
    const { version } = await fetchLatestBaileysVersion();

    if (!this.connectingPromise) {
      this.connectingPromise = new Promise<void>((resolve, reject) => {
        this.resolveConnecting = resolve;
        this.rejectConnecting = reject;
      });
      this.connectingPromise.catch(() => undefined);
    }

    const fullHistory = process.env.WHATSAPP_SYNC_FULL_HISTORY === "true";

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger as never),
      },
      printQRInTerminal: false,
      logger: logger as never,
      browser: Browsers.macOS("Arvore MCP"),
      generateHighQualityLinkPreview: false,
      syncFullHistory: fullHistory,
      // Baileys drops FULL history chunks by default even when it asked for them.
      ...(fullHistory ? { shouldSyncHistoryMessage: () => true } : {}),
      markOnlineOnConnect: false,
      getMessage: async (key) => this.storedMessage(key.id),
      cachedGroupMetadata: async (jid) => this.groups.get(jid),
    });

    this.sock = sock;
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qr = qr;
        this.state = "qr";
        try {
          this.qrAscii = await renderQrToAsciiString(qr);
        } catch {
          this.qrAscii = null;
        }
        try {
          this.qrPngPath = await renderQrToPng(qr, getQrPngPath(this.root));
        } catch {
          this.qrPngPath = null;
        }
        try {
          this.qrDataUrl = await renderQrToDataUrl(qr);
        } catch {
          this.qrDataUrl = null;
        }
        if (this.renderTerminalQr) {
          await renderQrToTerminal(qr).catch(() => undefined);
        }
      }

      if (connection === "open") {
        const id = sock.user?.id;
        const phone = id ? jidNormalizedUser(id).split("@")[0].split(":")[0] : null;
        this.state = "open";
        this.phone = phone;
        this.qr = null;
        process.stderr.write(`\n[whatsapp-mcp] ${this.label} connected${phone ? ` as ${phone}` : ""}\n`);
        this.resolveConnecting?.();
        this.connectingPromise = null;

        sock
          .groupFetchAllParticipating()
          .then((groups) => {
            for (const meta of Object.values(groups)) this.rememberGroup(meta);
          })
          .catch((err) => process.stderr.write(`[whatsapp-mcp] group fetch failed: ${err}\n`));
      }

      if (connection === "close") {
        const reason = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        const loggedOut = reason === DisconnectReason.loggedOut;
        const replaced = reason === DisconnectReason.connectionReplaced;
        const wasConnecting = this.state === "connecting" || this.state === "qr";

        this.state = "close";
        this.qr = null;
        this.sock = null;

        if (loggedOut) {
          process.stderr.write(`[whatsapp-mcp] ${this.label} logged out — clearing auth state\n`);
          this.clearAuthDir();
          this.phone = null;
          this.rejectConnecting?.(new Error("WhatsApp logged out"));
          this.connectingPromise = null;
          return;
        }

        if (replaced) {
          process.stderr.write(`[whatsapp-mcp] ${this.label} connection replaced by another session\n`);
          this.rejectConnecting?.(new Error("WhatsApp connection replaced"));
          this.connectingPromise = null;
          return;
        }

        process.stderr.write(`[whatsapp-mcp] ${this.label} disconnected (reason=${reason}) — reconnecting\n`);
        setTimeout(() => {
          this.startSocket().catch((err) => {
            process.stderr.write(`[whatsapp-mcp] reconnect failed: ${err}\n`);
            if (wasConnecting) {
              this.rejectConnecting?.(err as Error);
              this.connectingPromise = null;
            }
          });
        }, 2000);
      }
    });

    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify" && type !== "append") return;
      for (const msg of messages) {
        try {
          this.persistIncomingMessage(msg);
        } catch (err) {
          process.stderr.write(`[whatsapp-mcp] persist message failed: ${err}\n`);
        }
      }
    });

    sock.ev.on("messages.update", (updates) => {
      for (const { key, update } of updates) {
        if (!key.id) continue;
        try {
          const edited = update.message?.editedMessage?.message;
          if (edited) {
            const parsed = parseContent(edited);
            if (parsed) {
              this.store.editMessage(key.id, parsed.body, toNumber(update.messageTimestamp) || nowSeconds());
            }
            continue;
          }
          if (update.messageStubType === WAMessageStubType.REVOKE) {
            this.store.markDeleted(key.id, nowSeconds());
          }
        } catch (err) {
          process.stderr.write(`[whatsapp-mcp] apply message update failed: ${err}\n`);
        }
      }
    });

    sock.ev.on("chats.upsert", (chats) => this.applyUnread(chats, true));
    // Baileys sends unreadCount on chats.update as a delta: +n new messages, 0 read elsewhere, -1 marked unread.
    sock.ev.on("chats.update", (chats) => this.applyUnread(chats, false));

    sock.ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) this.saveContact(contact);
    });

    sock.ev.on("contacts.update", (contacts) => {
      for (const contact of contacts) this.saveContact(contact);
    });

    sock.ev.on("lid-mapping.update", ({ lid, pn }) => {
      this.store.saveLidMapping(jidNormalizedUser(lid), jidNormalizedUser(pn));
    });

    sock.ev.on("groups.upsert", (groups) => {
      for (const meta of groups) this.rememberGroup(meta);
    });

    sock.ev.on("groups.update", (updates) => {
      for (const update of updates) {
        if (!update.id) continue;
        const cached = this.groups.get(update.id);
        if (cached) this.groups.set(update.id, { ...cached, ...update } as GroupMetadata);
        if (update.subject) this.store.setChatName(update.id, update.subject, true);
      }
    });

    sock.ev.on("group-participants.update", ({ id }) => {
      this.groups.delete(id);
    });

    sock.ev.on(
      "messaging-history.set",
      ({ messages, contacts, chats, lidPnMappings, progress, syncType }) => {
        for (const mapping of lidPnMappings ?? []) {
          this.store.saveLidMapping(jidNormalizedUser(mapping.lid), jidNormalizedUser(mapping.pn));
        }
        for (const contact of contacts) this.saveContact(contact);
        for (const chat of chats) this.saveHistoryChat(chat);

        let stored = 0;
        for (const msg of messages) {
          try {
            if (this.persistIncomingMessage(msg, { historical: true })) stored += 1;
          } catch (err) {
            process.stderr.write(`[whatsapp-mcp] persist history message failed: ${err}\n`);
          }
        }

        const previous = this.historySync;
        this.historySync = {
          chunks: (previous?.chunks ?? 0) + 1,
          messagesReceived: (previous?.messagesReceived ?? 0) + messages.length,
          messagesStored: (previous?.messagesStored ?? 0) + stored,
          lastChunkAt: new Date().toISOString(),
          lastSyncType: syncType == null ? null : proto.HistorySync.HistorySyncType[syncType] ?? String(syncType),
          lastProgress: progress ?? null,
          phases: previous?.phases ?? {},
        };
      }
    );

    sock.ev.on("messaging-history.status", ({ syncType, status }) => {
      if (!this.historySync) return;
      this.historySync.phases[proto.HistorySync.HistorySyncType[syncType] ?? String(syncType)] = status;
    });
  }

  async fetchHistory(jid: string, count: number): Promise<FetchHistoryResult> {
    const sock = this.requireSocket();
    const anchor = this.store.oldestMessage(jid);
    if (!anchor) {
      throw new Error(
        `No stored message for ${jid} to anchor the request. WhatsApp only serves history older than a message you already have — send or receive one in this chat first.`
      );
    }

    const requestId = await sock.fetchMessageHistory(
      count,
      { remoteJid: anchor.chat, id: anchor.id, fromMe: anchor.direction === "out" },
      anchor.timestamp
    );

    return {
      requestId,
      anchorMessageId: anchor.id,
      anchorTimestamp: anchor.timestamp,
      requested: count,
      note: "WhatsApp answers asynchronously. Wait a few seconds and call get_messages again; history_status reports what arrived.",
    };
  }

  historyStatus(): HistorySyncInfo | null {
    return this.historySync;
  }

  private persistIncomingMessage(msg: WAMessage, opts: PersistOptions = {}): boolean {
    const remoteJid = msg.key.remoteJid;
    if (!remoteJid || remoteJid.endsWith("@broadcast") || remoteJid.endsWith("@newsletter")) return false;

    const parsed = parseContent(msg.message);
    if (!parsed) return false;

    const jid = this.canonical(remoteJid, msg.key.remoteJidAlt) ?? remoteJid;
    const isGroup = jid.endsWith("@g.us");
    const direction: Direction = msg.key.fromMe ? "out" : "in";
    const senderJid =
      direction === "out"
        ? this.ownJid()
        : isGroup
          ? this.canonical(msg.key.participant, msg.key.participantAlt)
          : jid;

    this.store.saveMessage(
      {
        id: msg.key.id || `${direction}-${Date.now()}`,
        jid,
        senderJid,
        direction,
        body: parsed.body,
        mediaType: parsed.mediaType,
        mediaMimetype: parsed.mediaMimetype,
        mediaPath: null,
        pushName: direction === "in" ? (msg.pushName ?? null) : null,
        quotedMessageId: parsed.quotedMessageId,
        timestamp: toNumber(msg.messageTimestamp) || nowSeconds(),
        raw: parsed.mediaType || (direction === "out" && !opts.historical) ? serialize(msg) : null,
      }
    );

    if (direction === "in" && msg.pushName && senderJid) {
      this.store.upsertContact({
        jid: senderJid,
        pushName: msg.pushName,
        phone: isPnUser(senderJid) ? stripJidSuffix(senderJid) : null,
        lid: isLidUser(senderJid) ? stripJidSuffix(senderJid) : null,
      });
    }

    return true;
  }
}

function serialize(msg: WAMessage): string {
  return JSON.stringify(msg, BufferJSON.replacer);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "application/pdf": ".pdf",
};

function mediaExtension(msg: WAMessage, mimetype: string): string {
  const fileName = normalizeMessageContent(msg.message)?.documentMessage?.fileName;
  const fromName = fileName ? extname(fileName) : "";
  if (fromName) return fromName;
  return EXTENSIONS[mimetype.split(";")[0].trim()] ?? "";
}
