import { existsSync, readdirSync, rmSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState,
  type WAMessage,
  type WAMessageContent,
  type WASocket,
} from "baileys";
import pino from "pino";
import { saveMessage, upsertContact, type Direction } from "./db.js";
import { renderQrToAsciiString, renderQrToDataUrl, renderQrToPng, renderQrToTerminal } from "./qr.js";
import { getAuthDir } from "./paths.js";
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

const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || "warn" });

export class WhatsAppClient {
  private sock: WASocket | null = null;
  private state: ConnectionState = "close";
  private phone: string | null = null;
  private qr: string | null = null;
  private qrAscii: string | null = null;
  private qrPngPath: string | null = null;
  private qrDataUrl: string | null = null;
  private connectingPromise: Promise<void> | null = null;
  private resolveConnecting: (() => void) | null = null;
  private rejectConnecting: ((err: Error) => void) | null = null;

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
    await this.startSocket();
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
    const dir = getAuthDir();
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

    saveMessage({
      id,
      jid,
      direction: "out",
      body: text,
      mediaType: null,
      mediaMimetype: null,
      mediaPath: null,
      pushName: null,
      quotedMessageId: opts.quotedMessageId ?? null,
      timestamp: Math.floor(Date.now() / 1000),
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

    saveMessage({
      id,
      jid,
      direction: "out",
      body: bodyLabel,
      mediaType: args.mediaType,
      mediaMimetype: args.mimetype,
      mediaPath: null,
      pushName: null,
      quotedMessageId: args.quotedMessageId ?? null,
      timestamp: Math.floor(Date.now() / 1000),
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

  async setPresence(to: string, type: "composing" | "paused" | "recording" | "available" | "unavailable"): Promise<void> {
    const sock = this.requireSocket();
    const jid = await this.resolveSendJid(to);

    if (type === "composing" || type === "recording") {
      await sock.presenceSubscribe(jid).catch(() => undefined);
    }
    await sock.sendPresenceUpdate(type, jid);
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
  }

  async deleteMessage(jid: string, messageId: string, fromMe = true): Promise<void> {
    const sock = this.requireSocket();
    await sock.sendMessage(jid, {
      delete: { remoteJid: jid, id: messageId, fromMe },
    });
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

  private async startSocket(): Promise<void> {
    this.state = "connecting";
    this.qr = null;
    this.qrAscii = null;
    this.qrPngPath = null;
    this.qrDataUrl = null;

    const { state, saveCreds } = await useMultiFileAuthState(getAuthDir());
    const { version } = await fetchLatestBaileysVersion();

    this.connectingPromise = new Promise<void>((resolve, reject) => {
      this.resolveConnecting = resolve;
      this.rejectConnecting = reject;
    });

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
      syncFullHistory: false,
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
          this.qrPngPath = await renderQrToPng(qr);
        } catch {
          this.qrPngPath = null;
        }
        try {
          this.qrDataUrl = await renderQrToDataUrl(qr);
        } catch {
          this.qrDataUrl = null;
        }
        await renderQrToTerminal(qr).catch(() => undefined);
      }

      if (connection === "open") {
        const id = sock.user?.id;
        const phone = id ? jidNormalizedUser(id).split("@")[0].split(":")[0] : null;
        this.state = "open";
        this.phone = phone;
        this.qr = null;
        process.stderr.write(`\n[whatsapp-mcp] connected${phone ? ` as ${phone}` : ""}\n`);
        this.resolveConnecting?.();
        this.connectingPromise = null;
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
          process.stderr.write("[whatsapp-mcp] logged out — clearing auth state\n");
          this.clearAuthDir();
          this.phone = null;
          this.rejectConnecting?.(new Error("WhatsApp logged out"));
          this.connectingPromise = null;
          return;
        }

        if (replaced) {
          process.stderr.write("[whatsapp-mcp] connection replaced by another session\n");
          this.rejectConnecting?.(new Error("WhatsApp connection replaced"));
          this.connectingPromise = null;
          return;
        }

        process.stderr.write(`[whatsapp-mcp] disconnected (reason=${reason}) — reconnecting\n`);
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

    sock.ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) {
        if (!contact.id) continue;
        upsertContact({
          jid: contact.id,
          pushName: contact.name || contact.notify || null,
          phone: contact.id.endsWith("@s.whatsapp.net") ? stripJidSuffix(contact.id) : null,
          lid: contact.id.endsWith("@lid") ? stripJidSuffix(contact.id) : null,
        });
      }
    });
  }

  private persistIncomingMessage(msg: WAMessage): void {
    const jid = msg.key.remoteJid;
    if (!jid || jid === "status@broadcast") return;
    if (jid.endsWith("@newsletter")) return;
    if (!msg.message) return;

    const direction: Direction = msg.key.fromMe ? "out" : "in";
    const message = msg.message.viewOnceMessage?.message || msg.message.viewOnceMessageV2?.message || msg.message;

    const body = extractBody(message as WAMessageContent);
    const mediaType = getMediaType(message as WAMessageContent);
    const mediaMimetype = getMediaMimetype(message as WAMessageContent);
    const caption = getMediaCaption(message as WAMessageContent);

    const finalBody = body || caption || (mediaType ? `[${mediaType}]` : "");
    if (!finalBody && !mediaType) return;

    const contextInfo =
      (message as { extendedTextMessage?: { contextInfo?: { stanzaId?: string } } }).extendedTextMessage?.contextInfo ||
      (message as { imageMessage?: { contextInfo?: { stanzaId?: string } } }).imageMessage?.contextInfo ||
      (message as { audioMessage?: { contextInfo?: { stanzaId?: string } } }).audioMessage?.contextInfo;
    const quotedMessageId = contextInfo?.stanzaId ?? null;

    saveMessage({
      id: msg.key.id || `${direction}-${Date.now()}`,
      jid,
      direction,
      body: finalBody,
      mediaType: mediaType ?? null,
      mediaMimetype,
      mediaPath: null,
      pushName: msg.pushName ?? null,
      quotedMessageId,
      timestamp: Number(msg.messageTimestamp ?? Math.floor(Date.now() / 1000)),
    });

    if (msg.pushName) {
      upsertContact({
        jid,
        pushName: msg.pushName,
        phone: jid.endsWith("@s.whatsapp.net") ? stripJidSuffix(jid) : null,
        lid: jid.endsWith("@lid") ? stripJidSuffix(jid) : null,
      });
    }
  }
}

function extractBody(message: WAMessageContent | null | undefined): string | null {
  if (!message) return null;
  return (
    (message as { conversation?: string }).conversation ||
    (message as { extendedTextMessage?: { text?: string } }).extendedTextMessage?.text ||
    null
  );
}

function getMediaType(message: WAMessageContent | null | undefined): string | null {
  if (!message) return null;
  if ((message as { audioMessage?: unknown }).audioMessage) {
    return (message as { audioMessage?: { ptt?: boolean } }).audioMessage?.ptt ? "voice_note" : "audio";
  }
  if ((message as { imageMessage?: unknown }).imageMessage) return "image";
  if ((message as { videoMessage?: unknown }).videoMessage) return "video";
  if ((message as { documentMessage?: unknown }).documentMessage) return "document";
  if ((message as { stickerMessage?: unknown }).stickerMessage) return "sticker";
  if ((message as { reactionMessage?: unknown }).reactionMessage) return "reaction";
  return null;
}

function getMediaMimetype(message: WAMessageContent | null | undefined): string | null {
  if (!message) return null;
  return (
    (message as { audioMessage?: { mimetype?: string } }).audioMessage?.mimetype ||
    (message as { imageMessage?: { mimetype?: string } }).imageMessage?.mimetype ||
    (message as { videoMessage?: { mimetype?: string } }).videoMessage?.mimetype ||
    (message as { documentMessage?: { mimetype?: string } }).documentMessage?.mimetype ||
    null
  );
}

function getMediaCaption(message: WAMessageContent | null | undefined): string | null {
  if (!message) return null;
  return (
    (message as { imageMessage?: { caption?: string } }).imageMessage?.caption ||
    (message as { videoMessage?: { caption?: string } }).videoMessage?.caption ||
    (message as { documentMessage?: { caption?: string } }).documentMessage?.caption ||
    null
  );
}
