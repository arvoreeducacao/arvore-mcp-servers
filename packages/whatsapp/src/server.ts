import { createServer, type Server as HttpServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  ConnectParamsSchema,
  DeleteMessageParamsSchema,
  DisconnectParamsSchema,
  EditMessageParamsSchema,
  GetMessagesParamsSchema,
  ListChatsParamsSchema,
  LogoutParamsSchema,
  MarkReadParamsSchema,
  QrCodeParamsSchema,
  ResolveJidParamsSchema,
  SearchContactsParamsSchema,
  SearchMessagesParamsSchema,
  SendMediaParamsSchema,
  SendMediaParamsShape,
  SendReactionParamsSchema,
  SendTextParamsSchema,
  StatusParamsSchema,
} from "./schemas.js";
import { GoogleSignInConfig, OAuthProvider, ResolvedIdentity } from "./oauth-provider.js";
import { SessionManager } from "./sessions.js";
import { seal, unseal } from "./sealed.js";
import { sessionSlug } from "./paths.js";
import { WhatsAppClient } from "./whatsapp-client.js";

const QR_LINK_TTL_MS = 15 * 60 * 1000;
const SERVICE_SESSION_KEY = "service";

type ToolResponse = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  isError?: boolean;
};

type QrLinkPayload = {
  key: string;
  expiresAt: number;
};

export interface WhatsAppMcpServerOptions {
  transport: "stdio" | "http";
  host: string;
  port: number;
  authToken: string;
  signingKey: string;
  publicUrl?: string;
  googleSignIn?: GoogleSignInConfig;
  allowedRedirectHosts?: string[];
}

export class WhatsAppMcpServer {
  private readonly options: WhatsAppMcpServerOptions;
  private readonly sessions: SessionManager;
  private readonly localClient: WhatsAppClient | null;
  private readonly oauth: OAuthProvider | null;
  private readonly publicUrl: string;
  private httpServer: HttpServer | null = null;
  private transports = new Map<string, { transport: StreamableHTTPServerTransport; sessionKey: string }>();

  constructor(options: WhatsAppMcpServerOptions) {
    this.options = options;
    this.publicUrl = (options.publicUrl || `http://${options.host}:${options.port}`).replace(
      /\/+$/,
      ""
    );
    this.sessions = new SessionManager(false);
    this.localClient = options.transport === "stdio" ? new WhatsAppClient() : null;
    this.oauth =
      options.transport === "http"
        ? new OAuthProvider({
            sharedSecret: options.authToken,
            signingSecret: options.signingKey,
            serviceName: "WhatsApp da Árvore",
            allowedRedirectHosts: options.allowedRedirectHosts,
            issuer: () => this.publicUrl,
            googleSignIn: options.googleSignIn,
          })
        : null;
  }

  private sessionKeyFor(identity: ResolvedIdentity | null): string {
    return identity ? sessionSlug(identity.email) : SERVICE_SESSION_KEY;
  }

  private clientFor(sessionKey: string): WhatsAppClient {
    if (this.localClient) return this.localClient;
    return this.sessions.get(sessionKey);
  }

  private qrLink(sessionKey: string): string {
    const payload: QrLinkPayload = { key: sessionKey, expiresAt: Date.now() + QR_LINK_TTL_MS };
    return `${this.publicUrl}/qr?t=${seal(payload, this.options.authToken, "qr")}`;
  }

  private createMcpServer(sessionKey: string): McpServer {
    const client = this.clientFor(sessionKey);
    const store = client.store;
    const pairingHint =
      this.options.transport === "http"
        ? " Abra a URL devolvida em qrUrl no navegador e escaneie o QR com o celular."
        : "";

    const server = new McpServer({
      name: "whatsapp-mcp-server",
      version: "0.2.0",
    });

    server.registerTool(
      "connect",
      {
        title: "Connect to WhatsApp",
        description:
          "Start a WhatsApp session for the authenticated user. If no auth state exists, returns a pairing QR code." +
          pairingHint +
          " Set waitForOpen=true to block until connection is open.",
        inputSchema: ConnectParamsSchema.shape,
      },
      async (params) => {
        const args = ConnectParamsSchema.parse(params);
        await client.connect();
        if (args.waitForOpen) {
          await client.waitForOpen(args.timeoutMs);
        }
        return jsonResponse(this.statusPayload(sessionKey, client));
      }
    );

    server.registerTool(
      "status",
      {
        title: "Get Connection Status",
        description:
          "Return the current WhatsApp connection state, phone and pairing URL for this session.",
        inputSchema: StatusParamsSchema.shape,
      },
      async () => jsonResponse(this.statusPayload(sessionKey, client))
    );

    server.registerTool(
      "qr_code",
      {
        title: "Get Pairing QR Code",
        description:
          "Get the current pairing QR code. Default `png` returns the QR as an inline image the agent can show directly. Use `ascii` for plain text, `data_url` for base64 data URL, or `raw` for the underlying string.",
        inputSchema: QrCodeParamsSchema.shape,
      },
      async (params) => {
        const args = QrCodeParamsSchema.parse(params);
        const status = client.getStatus();
        if (!status.qr) {
          return jsonResponse({
            available: false,
            state: status.state,
            message:
              status.state === "open"
                ? "Already connected — no QR needed."
                : "No QR available yet. Call connect first and wait a moment.",
          });
        }

        if (args.format === "raw") {
          return jsonResponse({ available: true, format: "raw", qr: status.qr });
        }
        if (args.format === "data_url") {
          return jsonResponse({
            available: true,
            format: "data_url",
            dataUrl: status.qrDataUrl,
          });
        }
        if (args.format === "png") {
          const pngBase64 = status.qrDataUrl?.replace(/^data:image\/png;base64,/, "") ?? "";
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    available: true,
                    format: "png",
                    qrUrl: this.options.transport === "http" ? this.qrLink(sessionKey) : null,
                    note: "Scan this QR with WhatsApp → Settings → Linked Devices → Link a Device",
                  },
                  null,
                  2
                ),
              },
              {
                type: "image",
                data: pngBase64,
                mimeType: "image/png",
              },
            ],
          };
        }
        return jsonResponse({
          available: true,
          format: "ascii",
          ascii: status.qrAscii,
        });
      }
    );

    server.registerTool(
      "disconnect",
      {
        title: "Disconnect WhatsApp",
        description:
          "Close the current socket without clearing auth state. You can reconnect later without scanning QR.",
        inputSchema: DisconnectParamsSchema.shape,
      },
      async () => {
        await client.disconnect();
        return jsonResponse({ ok: true });
      }
    );

    server.registerTool(
      "logout",
      {
        title: "Logout WhatsApp",
        description: "Log out and wipe local auth state. Requires re-pairing on next connect.",
        inputSchema: LogoutParamsSchema.shape,
      },
      async (params) => {
        LogoutParamsSchema.parse(params);
        await client.logout();
        return jsonResponse({ ok: true });
      }
    );

    server.registerTool(
      "send_text",
      {
        title: "Send Text Message",
        description:
          "Send a text message to a phone number or JID. Brazilian numbers are normalized automatically.",
        inputSchema: SendTextParamsSchema.shape,
      },
      async (params) => {
        const args = SendTextParamsSchema.parse(params);
        const result = await client.sendText(args.to, args.text, {
          quotedMessageId: args.quotedMessageId,
        });
        return jsonResponse(result);
      }
    );

    server.registerTool(
      "send_media",
      {
        title: "Send Media",
        description:
          "Send an image, audio, video, or document. Provide either filePath (absolute path) or base64. Audio defaults to push-to-talk voice notes.",
        inputSchema: SendMediaParamsShape,
      },
      async (params) => {
        const args = SendMediaParamsSchema.parse(params);
        if (args.filePath && this.options.transport === "http") {
          throw new Error("filePath is only available on stdio runs — send base64 instead.");
        }
        const buffer = args.filePath
          ? readFileSync(args.filePath)
          : Buffer.from(args.base64 ?? "", "base64");
        const mimetype =
          args.mimetype ||
          (args.filePath
            ? guessMimetype(args.filePath, args.mediaType)
            : guessMimetypeForType(args.mediaType));
        const result = await client.sendMedia({
          to: args.to,
          buffer,
          mimetype,
          mediaType: args.mediaType,
          caption: args.caption,
          ptt: args.ptt,
          filename: args.filename,
          quotedMessageId: args.quotedMessageId,
        });
        return jsonResponse(result);
      }
    );

    server.registerTool(
      "send_reaction",
      {
        title: "Send Reaction",
        description:
          "React to a message with an emoji. Pass an empty string to remove a previous reaction.",
        inputSchema: SendReactionParamsSchema.shape,
      },
      async (params) => {
        const args = SendReactionParamsSchema.parse(params);
        await client.sendReaction(args);
        return jsonResponse({ ok: true });
      }
    );

    server.registerTool(
      "mark_read",
      {
        title: "Mark Messages As Read",
        description:
          "Mark messages as read on WhatsApp and reset the local unread counter for this chat.",
        inputSchema: MarkReadParamsSchema.shape,
      },
      async (params) => {
        const args = MarkReadParamsSchema.parse(params);
        await client.markRead(args.messageIds, args.jid);
        store.markChatRead(args.jid);
        return jsonResponse({ ok: true });
      }
    );

    server.registerTool(
      "list_chats",
      {
        title: "List Chats",
        description: "List recent chats with last message preview and unread count.",
        inputSchema: ListChatsParamsSchema.shape,
      },
      async (params) => {
        const args = ListChatsParamsSchema.parse(params);
        return jsonResponse({ chats: store.listChats(args.limit, args.offset, args.onlyUnread) });
      }
    );

    server.registerTool(
      "get_messages",
      {
        title: "Get Messages",
        description:
          "Get message history for a specific chat, ordered chronologically (oldest first).",
        inputSchema: GetMessagesParamsSchema.shape,
      },
      async (params) => {
        const args = GetMessagesParamsSchema.parse(params);
        return jsonResponse({
          messages: store.listMessages(args.jid, args.limit, args.beforeTimestamp),
        });
      }
    );

    server.registerTool(
      "search_messages",
      {
        title: "Search Messages",
        description: "Substring search in message bodies across all chats.",
        inputSchema: SearchMessagesParamsSchema.shape,
      },
      async (params) => {
        const args = SearchMessagesParamsSchema.parse(params);
        return jsonResponse({ messages: store.searchMessages(args.query, args.limit) });
      }
    );

    server.registerTool(
      "search_contacts",
      {
        title: "Search Contacts",
        description:
          "Fuzzy substring search across known contacts (name, phone, JID, LID). Use this before send_text when you only know a name.",
        inputSchema: SearchContactsParamsSchema.shape,
      },
      async (params) => {
        const args = SearchContactsParamsSchema.parse(params);
        return jsonResponse({ contacts: store.searchContacts(args.query, args.limit) });
      }
    );

    server.registerTool(
      "resolve_jid",
      {
        title: "Resolve Phone to JID",
        description:
          "Validate a phone number against WhatsApp and return its canonical JID. Use this to confirm a number is reachable before sending.",
        inputSchema: ResolveJidParamsSchema.shape,
      },
      async (params) => {
        const args = ResolveJidParamsSchema.parse(params);
        return jsonResponse(await client.resolveJid(args.input));
      }
    );

    server.registerTool(
      "edit_message",
      {
        title: "Edit Message",
        description: "Edit a message you previously sent.",
        inputSchema: EditMessageParamsSchema.shape,
      },
      async (params) => {
        const args = EditMessageParamsSchema.parse(params);
        await client.editMessage(args.jid, args.messageId, args.newText);
        return jsonResponse({ ok: true });
      }
    );

    server.registerTool(
      "delete_message",
      {
        title: "Delete Message",
        description: "Delete a message in a chat. Defaults to deleting one of your own messages.",
        inputSchema: DeleteMessageParamsSchema.shape,
      },
      async (params) => {
        const args = DeleteMessageParamsSchema.parse(params);
        await client.deleteMessage(args.jid, args.messageId, args.fromMe);
        return jsonResponse({ ok: true });
      }
    );

    return server;
  }

  private statusPayload(sessionKey: string, client: WhatsAppClient): Record<string, unknown> {
    const status = client.getStatus();
    return {
      session: sessionKey,
      state: status.state,
      phone: status.phone,
      paired: client.hasAuthState(),
      qrAvailable: !!status.qr,
      qrUrl:
        this.options.transport === "http" && status.state !== "open"
          ? this.qrLink(sessionKey)
          : null,
    };
  }

  async start(): Promise<void> {
    if (this.options.transport === "http") {
      await this.startHttp();
      return;
    }

    const server = this.createMcpServer(SERVICE_SESSION_KEY);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write("[whatsapp-mcp] server started on stdio\n");
  }

  private async startHttp(): Promise<void> {
    const { host, port, authToken } = this.options;
    const oauth = this.oauth;

    if (!oauth) {
      throw new Error("http transport requires the OAuth provider");
    }

    const restored = this.sessions.restorePaired();
    if (restored.length > 0) {
      process.stderr.write(`[whatsapp-mcp] restoring sessions: ${restored.join(", ")}\n`);
    }

    this.httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

        if (url.pathname === "/health") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("ok");
          return;
        }

        if (oauth.handles(url.pathname)) {
          await oauth.handle(req, res, url);
          return;
        }

        if (url.pathname.startsWith("/qr")) {
          this.handleQr(res, url);
          return;
        }

        if (url.pathname !== "/mcp") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }

        const bearer = readBearer(req);
        const staticAuthorized = matchesToken(bearer, authToken);
        const identity = bearer === "" ? null : oauth.resolveIdentity(bearer);
        const authorized =
          staticAuthorized || (bearer !== "" && oauth.verifyAccessToken(bearer));

        if (!authorized) {
          res.writeHead(401, {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer realm="whatsapp-mcp", resource_metadata="${this.publicUrl}/.well-known/oauth-protected-resource"`,
          });
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }

        if (req.method !== "POST" && req.method !== "GET" && req.method !== "DELETE") {
          res.writeHead(405, { "Content-Type": "text/plain" });
          res.end("Method not allowed");
          return;
        }

        const body = req.method === "POST" ? await readJsonBody(req) : undefined;
        const sessionKey = this.sessionKeyFor(identity);
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        const known = sessionId ? this.transports.get(sessionId) : undefined;

        if (known && known.sessionKey !== sessionKey) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "session belongs to another identity" }));
          return;
        }

        let transport = known?.transport;

        if (!transport) {
          if (req.method !== "POST" || !isInitializeRequest(body)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: sessionId
                  ? "unknown session — reinitialize"
                  : "missing mcp-session-id; only an initialize request may open a session",
              })
            );
            return;
          }

          const created = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => {
              this.transports.set(id, { transport: created, sessionKey });
            },
          });

          created.onclose = () => {
            if (created.sessionId) this.transports.delete(created.sessionId);
          };

          await this.createMcpServer(sessionKey).connect(created);
          transport = created;
        }

        await transport.handleRequest(req, res, body);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[whatsapp-mcp] http handler error: ${message}\n`);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
      }
    });

    await new Promise<void>((resolve) => {
      this.httpServer!.listen(port, host, () => resolve());
    });

    process.stderr.write(
      `[whatsapp-mcp] listening on http://${host}:${port}/mcp (public ${this.publicUrl})\n`
    );
  }

  private handleQr(res: ServerResponse, url: URL): void {
    const payload = unseal<QrLinkPayload>(
      url.searchParams.get("t") || "",
      this.options.authToken,
      "qr"
    );

    if (!payload || payload.expiresAt < Date.now()) {
      res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        renderQrPage({
          title: "Link expirado",
          message: "Peça um novo link de pareamento pela ferramenta connect.",
        })
      );
      return;
    }

    const client = this.sessions.get(payload.key);
    const status = client.getStatus();

    if (url.pathname === "/qr.png") {
      const base64 = status.qrDataUrl?.replace(/^data:image\/png;base64,/, "");
      if (!base64) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("no qr");
        return;
      }
      const buffer = Buffer.from(base64, "base64");
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": buffer.length,
        "Cache-Control": "no-store",
      });
      res.end(buffer);
      return;
    }

    if (url.pathname === "/qr/status") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(
        JSON.stringify({
          state: status.state,
          hasQr: !!status.qr,
        })
      );
      return;
    }

    if (status.state === "close") {
      client.connect().catch((error) => {
        process.stderr.write(`[whatsapp-mcp] ${payload.key} connect failed: ${error}\n`);
      });
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(renderQrPage({ token: url.searchParams.get("t") || "", session: payload.key }));
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      process.stderr.write(`[whatsapp-mcp] received ${signal}, shutting down\n`);
      for (const { transport } of this.transports.values()) {
        await transport.close().catch(() => undefined);
      }
      await this.localClient?.disconnect().catch(() => undefined);
      await this.sessions.closeAll();
      this.httpServer?.close();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", (error) => {
      process.stderr.write(`[whatsapp-mcp] uncaught: ${error}\n`);
    });
    process.on("unhandledRejection", (reason) => {
      process.stderr.write(`[whatsapp-mcp] unhandled rejection: ${reason}\n`);
    });
  }
}

function renderQrPage(params: {
  token?: string;
  session?: string;
  title?: string;
  message?: string;
}): string {
  const head = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WhatsApp MCP</title>
<style>
:root{color-scheme:light dark}
body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}
main{width:100%;max-width:400px;padding:40px;background:#1e293b;border-radius:16px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.4)}
h1{margin:0 0 8px;font-size:20px}
p{margin:0 0 24px;color:#94a3b8;line-height:1.5;font-size:14px}
img{width:100%;max-width:280px;border-radius:12px;background:#fff;padding:12px;box-sizing:border-box}
.state{margin-top:20px;font-size:13px;color:#94a3b8}
.ok{color:#4ade80;font-weight:600}
</style></head><body><main>`;

  if (params.title) {
    return `${head}<h1>${escapeHtml(params.title)}</h1><p>${escapeHtml(
      params.message || ""
    )}</p></main></body></html>`;
  }

  const token = encodeURIComponent(params.token || "");
  return `${head}
<h1>Parear WhatsApp</h1>
<p>WhatsApp no celular → Aparelhos conectados → Conectar aparelho. Sessão <strong>${escapeHtml(
    params.session || ""
  )}</strong>.</p>
<img id="qr" alt="QR code" src="/qr.png?t=${token}">
<div class="state" id="state">carregando…</div>
<script>
const token = "${token}";
const img = document.getElementById("qr");
const state = document.getElementById("state");
async function tick() {
  try {
    const res = await fetch("/qr/status?t=" + token, { cache: "no-store" });
    const data = await res.json();
    if (data.state === "open") {
      state.innerHTML = '<span class="ok">Conectado</span>';
      img.style.display = "none";
      return;
    }
    state.textContent = data.hasQr ? "aguardando leitura do QR" : "conectando…";
    if (data.hasQr) img.src = "/qr.png?t=" + token + "&v=" + Date.now();
  } catch (error) {
    state.textContent = "erro ao consultar status";
  }
  setTimeout(tick, 3000);
}
tick();
</script>
</main></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonResponse(value: unknown): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function readBearer(req: IncomingMessage): string {
  const header = req.headers.authorization || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function matchesToken(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;
  const given = Buffer.from(candidate);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length) return false;
  return timingSafeEqual(given, wanted);
}

const MAX_BODY_BYTES = 16 * 1024 * 1024;

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(buffer);
  }

  if (size === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function guessMimetype(
  path: string,
  fallbackType: "image" | "audio" | "document" | "video"
): string {
  const ext = extname(path).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg; codecs=opus",
    ".opus": "audio/ogg; codecs=opus",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".csv": "text/csv",
    ".txt": "text/plain",
  };
  return map[ext] || guessMimetypeForType(fallbackType);
}

function guessMimetypeForType(type: "image" | "audio" | "document" | "video"): string {
  switch (type) {
    case "image":
      return "image/jpeg";
    case "audio":
      return "audio/ogg; codecs=opus";
    case "video":
      return "video/mp4";
    default:
      return "application/octet-stream";
  }
}
