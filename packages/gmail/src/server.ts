import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GmailClient } from "./client.js";
import { GmailMCPTools } from "./tools.js";
import {
  GmailClientConfig,
  MessagesListParamsSchema,
  MessagesGetParamsSchema,
  MessagesSendParamsSchema,
  DraftsCreateParamsSchema,
  DraftsListParamsSchema,
  DraftsSendParamsSchema,
  ThreadsGetParamsSchema,
  MessagesModifyParamsSchema,
  MessagesTrashParamsSchema,
  LabelsListParamsSchema,
  ProfileGetParamsSchema,
} from "./types.js";

export interface GmailMCPServerOptions {
  client: GmailClientConfig;
  allowSend: boolean;
}

export class GmailMCPServer {
  private server: McpServer;
  private client: GmailClient;
  private tools: GmailMCPTools;

  constructor(options: GmailMCPServerOptions) {
    this.server = new McpServer({
      name: "gmail-mcp-server",
      version: "1.0.0",
    });

    this.client = new GmailClient(options.client);
    this.tools = new GmailMCPTools(this.client, {
      allowSend: options.allowSend,
    });

    this.setupTools(options.allowSend);
  }

  private setupTools(allowSend: boolean): void {
    this.server.registerTool(
      "messages_list",
      {
        title: "List Messages",
        description:
          "List Gmail messages matching a search query. Supports Gmail search syntax (from:, subject:, newer_than:, has:attachment, is:unread, label:, etc.).",
        inputSchema: MessagesListParamsSchema.shape,
      },
      async (params) => {
        const validated = MessagesListParamsSchema.parse(params);
        return this.tools.listMessages(validated);
      }
    );

    this.server.registerTool(
      "messages_get",
      {
        title: "Get Message",
        description:
          "Get a specific Gmail message with parsed headers and body. Use format=metadata to skip body for faster responses.",
        inputSchema: MessagesGetParamsSchema.shape,
      },
      async (params) => {
        const validated = MessagesGetParamsSchema.parse(params);
        return this.tools.getMessage(validated);
      }
    );

    this.server.registerTool(
      "threads_get",
      {
        title: "Get Thread",
        description:
          "Get all messages in a Gmail thread with parsed content. Useful for following email conversations end-to-end.",
        inputSchema: ThreadsGetParamsSchema.shape,
      },
      async (params) => {
        const validated = ThreadsGetParamsSchema.parse(params);
        return this.tools.getThread(validated);
      }
    );

    this.server.registerTool(
      "drafts_list",
      {
        title: "List Drafts",
        description: "List Gmail drafts. Optionally filter by search query.",
        inputSchema: DraftsListParamsSchema.shape,
      },
      async (params) => {
        const validated = DraftsListParamsSchema.parse(params);
        return this.tools.listDrafts(validated);
      }
    );

    this.server.registerTool(
      "drafts_create",
      {
        title: "Create Draft",
        description:
          "Create a Gmail draft (does NOT send). Pass replyToMessageId to thread the draft as a reply with proper In-Reply-To/References headers. Always available, even when sending is disabled.",
        inputSchema: DraftsCreateParamsSchema.shape,
      },
      async (params) => {
        const validated = DraftsCreateParamsSchema.parse(params);
        return this.tools.createDraft(validated);
      }
    );

    if (allowSend) {
      this.server.registerTool(
        "messages_send",
        {
          title: "Send Message",
          description:
            "Send an email immediately via Gmail. Requires GMAIL_MCP_ALLOW_SEND=true. Pass replyToMessageId to send as a reply with proper threading.",
          inputSchema: MessagesSendParamsSchema.shape,
        },
        async (params) => {
          const validated = MessagesSendParamsSchema.parse(params);
          return this.tools.sendMessage(validated);
        }
      );

      this.server.registerTool(
        "drafts_send",
        {
          title: "Send Draft",
          description:
            "Send an existing Gmail draft. Requires GMAIL_MCP_ALLOW_SEND=true.",
          inputSchema: DraftsSendParamsSchema.shape,
        },
        async (params) => {
          const validated = DraftsSendParamsSchema.parse(params);
          return this.tools.sendDraft(validated);
        }
      );
    }

    this.server.registerTool(
      "messages_modify",
      {
        title: "Modify Message Labels",
        description:
          "Add or remove labels on a message. Common labels: INBOX, UNREAD, STARRED, IMPORTANT. Use this to mark as read (remove UNREAD), archive (remove INBOX), star (add STARRED), etc.",
        inputSchema: MessagesModifyParamsSchema.shape,
      },
      async (params) => {
        const validated = MessagesModifyParamsSchema.parse(params);
        return this.tools.modifyMessage(validated);
      }
    );

    this.server.registerTool(
      "messages_trash",
      {
        title: "Move Message to Trash",
        description:
          "Move a Gmail message to trash. Reversible — Gmail keeps trashed messages for 30 days.",
        inputSchema: MessagesTrashParamsSchema.shape,
      },
      async (params) => {
        const validated = MessagesTrashParamsSchema.parse(params);
        return this.tools.trashMessage(validated);
      }
    );

    this.server.registerTool(
      "labels_list",
      {
        title: "List Labels",
        description:
          "List all Gmail labels (system + user-defined). Returns label IDs needed by messages_modify and messages_list.",
        inputSchema: LabelsListParamsSchema.shape,
      },
      async (params) => {
        const validated = LabelsListParamsSchema.parse(params);
        return this.tools.listLabels(validated);
      }
    );

    this.server.registerTool(
      "profile_get",
      {
        title: "Get Profile",
        description:
          "Get the authenticated user's Gmail profile (email address, total message/thread count, history ID).",
        inputSchema: ProfileGetParamsSchema.shape,
      },
      async (params) => {
        const validated = ProfileGetParamsSchema.parse(params);
        return this.tools.getProfile(validated);
      }
    );
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Gmail MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start Gmail MCP Server:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", async (error) => {
      console.error("Uncaught exception:", error);
      process.exit(1);
    });
    process.on("unhandledRejection", async (reason) => {
      console.error("Unhandled rejection:", reason);
      process.exit(1);
    });
  }
}
