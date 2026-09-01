import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LeafConnection } from "./database.js";
import { LeafMCPTools } from "./tools.js";
import {
  GetDatabaseParams,
  GetDatabaseParamsSchema,
  GetDocumentParams,
  GetDocumentParamsSchema,
  LeafConfigInput,
  LeafMCPError,
  ListCommentsParams,
  ListCommentsParamsSchema,
  ListDocumentsParams,
  ListDocumentsParamsSchema,
  SearchDocumentsParams,
  SearchDocumentsParamsSchema,
} from "./types.js";

export class LeafMCPServer {
  private server: McpServer;
  private db: LeafConnection;
  private tools: LeafMCPTools;

  constructor(config: LeafConfigInput) {
    this.server = new McpServer({
      name: "leaf-mcp-server",
      version: "1.0.0",
    });

    this.db = new LeafConnection(config);
    this.tools = new LeafMCPTools(this.db);

    this.setupTools();
  }

  static fromEnvironment(): LeafMCPServer {
    const databaseUrl = process.env.LEAF_DATABASE_URL;

    if (!databaseUrl) {
      throw new LeafMCPError(
        "LEAF_DATABASE_URL is required (mysql://user:password@host:3306/leaf)",
        "MISSING_CONFIG"
      );
    }

    return new LeafMCPServer({
      databaseUrl,
      connectionTimeout: parseInt(
        process.env.LEAF_CONNECTION_TIMEOUT || "30000",
        10
      ),
    });
  }

  private setupTools(): void {
    this.server.registerTool(
      "search_documents",
      {
        title: "Search Documents",
        description:
          "Full-text search over Leaf document titles and bodies. Falls back to title matching when the full-text index has no hits.",
        inputSchema: {
          query: SearchDocumentsParamsSchema.shape.query,
          limit: SearchDocumentsParamsSchema.shape.limit,
        },
      },
      async (params) => {
        return this.tools.searchDocuments(
          SearchDocumentsParamsSchema.parse(params) as SearchDocumentsParams
        );
      }
    );

    this.server.registerTool(
      "get_document",
      {
        title: "Get Document",
        description:
          "Read one Leaf document: metadata, content rendered as markdown, row property values (for database rows) and direct children.",
        inputSchema: {
          documentId: GetDocumentParamsSchema.shape.documentId,
        },
      },
      async (params) => {
        return this.tools.getDocument(
          GetDocumentParamsSchema.parse(params) as GetDocumentParams
        );
      }
    );

    this.server.registerTool(
      "list_documents",
      {
        title: "List Documents",
        description:
          "List Leaf documents (pages and databases, not rows), optionally filtered by organization id or owner email.",
        inputSchema: {
          orgId: ListDocumentsParamsSchema.shape.orgId,
          ownerEmail: ListDocumentsParamsSchema.shape.ownerEmail,
          limit: ListDocumentsParamsSchema.shape.limit,
        },
      },
      async (params) => {
        return this.tools.listDocuments(
          ListDocumentsParamsSchema.parse(params) as ListDocumentsParams
        );
      }
    );

    this.server.registerTool(
      "list_organizations",
      {
        title: "List Organizations",
        description:
          "List Leaf organizations with their members (email and role) and teamspaces.",
        inputSchema: {},
      },
      async () => {
        return this.tools.listOrganizations();
      }
    );

    this.server.registerTool(
      "get_database",
      {
        title: "Get Database",
        description:
          "Read a Leaf database (Notion-style): typed properties, views, and all rows with values resolved to property and option names.",
        inputSchema: {
          databaseId: GetDatabaseParamsSchema.shape.databaseId,
        },
      },
      async (params) => {
        return this.tools.getDatabase(
          GetDatabaseParamsSchema.parse(params) as GetDatabaseParams
        );
      }
    );

    this.server.registerTool(
      "list_comments",
      {
        title: "List Comments",
        description:
          "List the comment threads of a Leaf document, with replies, authors, block anchors and resolved state.",
        inputSchema: {
          documentId: ListCommentsParamsSchema.shape.documentId,
        },
      },
      async (params) => {
        return this.tools.listComments(
          ListCommentsParamsSchema.parse(params) as ListCommentsParams
        );
      }
    );
  }

  async start(): Promise<void> {
    try {
      await this.db.connect();

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error("Leaf MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start Leaf MCP Server:",
        error instanceof Error ? error.message : error
      );
      await this.cleanup();
      process.exit(1);
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.db.disconnect();
    } catch (error) {
      console.error(
        "Error during cleanup:",
        error instanceof Error ? error.message : error
      );
    }
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      await this.cleanup();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", async (error) => {
      console.error("Uncaught exception:", error);
      await this.cleanup();
      process.exit(1);
    });
    process.on("unhandledRejection", async (reason) => {
      console.error("Unhandled rejection:", reason);
      await this.cleanup();
      process.exit(1);
    });
  }
}
