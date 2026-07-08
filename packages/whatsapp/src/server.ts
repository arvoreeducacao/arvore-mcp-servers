import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import {
  listChats,
  listMessages,
  markChatRead,
  searchContacts,
  searchMessages,
} from "./db.js";
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
import { WhatsAppClient } from "./whatsapp-client.js";

type ToolResponse = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  isError?: boolean;
};

export class WhatsAppMcpServer {
  private readonly server: McpServer;
  private readonly client: WhatsAppClient;

  constructor() {
    this.server = new McpServer({
      name: "whatsapp-mcp-server",
      version: "0.1.0",
    });
    this.client = new WhatsAppClient();
    this.registerTools();
  }

  private registerTools(): void {
    this.server.registerTool(
      "connect",
      {
        title: "Connect to WhatsApp",
        description:
          "Start a WhatsApp session. If no auth state exists, returns a QR code for pairing. " +
          "Set waitForOpen=true to block until connection is open. " +
          "After calling, use the qr_code tool to retrieve the pairing QR in your preferred format.",
        inputSchema: ConnectParamsSchema.shape,
      },
      async (params) => {
        const args = ConnectParamsSchema.parse(params);
        await this.client.connect();
        if (args.waitForOpen) {
          await this.client.waitForOpen(args.timeoutMs);
        }
        return jsonResponse(this.client.getStatus());
      }
    );

    this.server.registerTool(
      "status",
      {
        title: "Get Connection Status",
        description: "Return the current WhatsApp connection state, phone, and QR availability.",
        inputSchema: StatusParamsSchema.shape,
      },
      async () => {
        return jsonResponse(this.client.getStatus());
      }
    );

    this.server.registerTool(
      "qr_code",
      {
        title: "Get Pairing QR Code",
        description:
          "Get the current pairing QR code. Default `png` returns the QR as an inline image the agent can show directly. Use `ascii` for plain text, `data_url` for base64 data URL, or `raw` for the underlying string.",
        inputSchema: QrCodeParamsSchema.shape,
      },
      async (params) => {
        const args = QrCodeParamsSchema.parse(params);
        const status = this.client.getStatus();
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
                    path: status.qrPngPath,
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

    this.server.registerTool(
      "disconnect",
      {
        title: "Disconnect WhatsApp",
        description: "Close the current socket without clearing auth state. You can reconnect later without scanning QR.",
        inputSchema: DisconnectParamsSchema.shape,
      },
      async () => {
        await this.client.disconnect();
        return jsonResponse({ ok: true });
      }
    );

    this.server.registerTool(
      "logout",
      {
        title: "Logout WhatsApp",
        description: "Log out and wipe local auth state. Requires re-pairing on next connect.",
        inputSchema: LogoutParamsSchema.shape,
      },
      async (params) => {
        LogoutParamsSchema.parse(params);
        await this.client.logout();
        return jsonResponse({ ok: true });
      }
    );

    this.server.registerTool(
      "send_text",
      {
        title: "Send Text Message",
        description:
          "Send a text message to a phone number or JID. Brazilian numbers are normalized automatically.",
        inputSchema: SendTextParamsSchema.shape,
      },
      async (params) => {
        const args = SendTextParamsSchema.parse(params);
        const result = await this.client.sendText(args.to, args.text, {
          quotedMessageId: args.quotedMessageId,
        });
        return jsonResponse(result);
      }
    );

    this.server.registerTool(
      "send_media",
      {
        title: "Send Media",
        description:
          "Send an image, audio, video, or document. Provide either filePath (absolute path) or base64. Audio defaults to push-to-talk voice notes.",
        inputSchema: SendMediaParamsShape,
      },
      async (params) => {
        const args = SendMediaParamsSchema.parse(params);
        const buffer = args.filePath
          ? readFileSync(args.filePath)
          : Buffer.from(args.base64 ?? "", "base64");
        const mimetype = args.mimetype || (args.filePath ? guessMimetype(args.filePath, args.mediaType) : guessMimetypeForType(args.mediaType));
        const result = await this.client.sendMedia({
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

    this.server.registerTool(
      "send_reaction",
      {
        title: "Send Reaction",
        description: "React to a message with an emoji. Pass an empty string to remove a previous reaction.",
        inputSchema: SendReactionParamsSchema.shape,
      },
      async (params) => {
        const args = SendReactionParamsSchema.parse(params);
        await this.client.sendReaction(args);
        return jsonResponse({ ok: true });
      }
    );

    this.server.registerTool(
      "mark_read",
      {
        title: "Mark Messages As Read",
        description: "Mark messages as read on WhatsApp and reset the local unread counter for this chat.",
        inputSchema: MarkReadParamsSchema.shape,
      },
      async (params) => {
        const args = MarkReadParamsSchema.parse(params);
        await this.client.markRead(args.messageIds, args.jid);
        markChatRead(args.jid);
        return jsonResponse({ ok: true });
      }
    );

    this.server.registerTool(
      "list_chats",
      {
        title: "List Chats",
        description: "List recent chats with last message preview and unread count.",
        inputSchema: ListChatsParamsSchema.shape,
      },
      async (params) => {
        const args = ListChatsParamsSchema.parse(params);
        const chats = listChats(args.limit, args.offset, args.onlyUnread);
        return jsonResponse({ chats });
      }
    );

    this.server.registerTool(
      "get_messages",
      {
        title: "Get Messages",
        description: "Get message history for a specific chat, ordered chronologically (oldest first).",
        inputSchema: GetMessagesParamsSchema.shape,
      },
      async (params) => {
        const args = GetMessagesParamsSchema.parse(params);
        const messages = listMessages(args.jid, args.limit, args.beforeTimestamp);
        return jsonResponse({ messages });
      }
    );

    this.server.registerTool(
      "search_messages",
      {
        title: "Search Messages",
        description: "Substring search in message bodies across all chats.",
        inputSchema: SearchMessagesParamsSchema.shape,
      },
      async (params) => {
        const args = SearchMessagesParamsSchema.parse(params);
        const messages = searchMessages(args.query, args.limit);
        return jsonResponse({ messages });
      }
    );

    this.server.registerTool(
      "search_contacts",
      {
        title: "Search Contacts",
        description:
          "Fuzzy substring search across known contacts (name, phone, JID, LID). Use this before send_text when you only know a name.",
        inputSchema: SearchContactsParamsSchema.shape,
      },
      async (params) => {
        const args = SearchContactsParamsSchema.parse(params);
        const contacts = searchContacts(args.query, args.limit);
        return jsonResponse({ contacts });
      }
    );

    this.server.registerTool(
      "resolve_jid",
      {
        title: "Resolve Phone to JID",
        description:
          "Validate a phone number against WhatsApp and return its canonical JID. Use this to confirm a number is reachable before sending.",
        inputSchema: ResolveJidParamsSchema.shape,
      },
      async (params) => {
        const args = ResolveJidParamsSchema.parse(params);
        const result = await this.client.resolveJid(args.input);
        return jsonResponse(result);
      }
    );

    this.server.registerTool(
      "edit_message",
      {
        title: "Edit Message",
        description: "Edit a message you previously sent.",
        inputSchema: EditMessageParamsSchema.shape,
      },
      async (params) => {
        const args = EditMessageParamsSchema.parse(params);
        await this.client.editMessage(args.jid, args.messageId, args.newText);
        return jsonResponse({ ok: true });
      }
    );

    this.server.registerTool(
      "delete_message",
      {
        title: "Delete Message",
        description: "Delete a message in a chat. Defaults to deleting one of your own messages.",
        inputSchema: DeleteMessageParamsSchema.shape,
      },
      async (params) => {
        const args = DeleteMessageParamsSchema.parse(params);
        await this.client.deleteMessage(args.jid, args.messageId, args.fromMe);
        return jsonResponse({ ok: true });
      }
    );

  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    process.stderr.write("[whatsapp-mcp] server started\n");
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      process.stderr.write(`[whatsapp-mcp] received ${signal}, shutting down\n`);
      await this.client.disconnect().catch(() => undefined);
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

function jsonResponse(value: unknown): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function guessMimetype(path: string, fallbackType: "image" | "audio" | "document" | "video"): string {
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
