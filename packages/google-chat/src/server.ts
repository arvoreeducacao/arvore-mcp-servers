import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleChatClient } from "./client.js";
import { GoogleChatMCPTools } from "./tools.js";
import {
  GoogleChatClientConfig,
  SpacesListParamsSchema,
  SpacesGetParamsSchema,
  MembersListParamsSchema,
  MessagesListParamsSchema,
  MessagesGetParamsSchema,
  MessagesCreateParamsSchema,
  MessagesDeleteParamsSchema,
} from "./types.js";

export class GoogleChatMCPServer {
  private server: McpServer;
  private client: GoogleChatClient;
  private tools: GoogleChatMCPTools;

  constructor(config: GoogleChatClientConfig) {
    this.server = new McpServer({
      name: "google-chat-mcp-server",
      version: "1.0.0",
    });

    this.client = new GoogleChatClient(config);
    this.tools = new GoogleChatMCPTools(this.client);

    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool(
      "spaces_list",
      {
        title: "List Spaces",
        description:
          "List Google Chat spaces the authenticated user or bot has access to. Supports filtering by space type and pagination.",
        inputSchema: SpacesListParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = SpacesListParamsSchema.parse(params);
        return this.tools.listSpaces(validatedParams);
      }
    );

    this.server.registerTool(
      "spaces_get",
      {
        title: "Get Space",
        description:
          "Get detailed information about a specific Google Chat space including display name, type, threading state, and membership count.",
        inputSchema: SpacesGetParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = SpacesGetParamsSchema.parse(params);
        return this.tools.getSpace(validatedParams);
      }
    );

    this.server.registerTool(
      "members_list",
      {
        title: "List Members",
        description:
          "List members of a Google Chat space including their roles and membership state.",
        inputSchema: MembersListParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = MembersListParamsSchema.parse(params);
        return this.tools.listMembers(validatedParams);
      }
    );

    this.server.registerTool(
      "messages_list",
      {
        title: "List Messages",
        description:
          "List messages in a Google Chat space. Supports filtering by time range, thread, and pagination. Requires user authentication (domain-wide delegation).",
        inputSchema: MessagesListParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = MessagesListParamsSchema.parse(params);
        return this.tools.listMessages(validatedParams);
      }
    );

    this.server.registerTool(
      "messages_get",
      {
        title: "Get Message",
        description:
          "Get the full content of a specific message by its resource name.",
        inputSchema: MessagesGetParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = MessagesGetParamsSchema.parse(params);
        return this.tools.getMessage(validatedParams);
      }
    );

    this.server.registerTool(
      "messages_create",
      {
        title: "Create Message",
        description:
          "Send a message to a Google Chat space. Supports creating new threads or replying to existing threads using threadKey or threadName.",
        inputSchema: MessagesCreateParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = MessagesCreateParamsSchema.parse(params);
        return this.tools.createMessage(validatedParams);
      }
    );

    this.server.registerTool(
      "messages_delete",
      {
        title: "Delete Message",
        description:
          "Delete a message from a Google Chat space. The authenticated user must have permission to delete the message.",
        inputSchema: MessagesDeleteParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = MessagesDeleteParamsSchema.parse(params);
        return this.tools.deleteMessage(validatedParams);
      }
    );
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Google Chat MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start Google Chat MCP Server:",
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
