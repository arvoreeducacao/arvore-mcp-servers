import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ClientHubApiClient } from "./api-client.js";
import { ClientHubMCPTools } from "./tools.js";
import {
  ClientHubConfig,
  ClientHubConfigSchema,
  ClientHubMCPError,
  GetClient360Params,
  GetClient360ParamsSchema,
  ListLinksParams,
  ListLinksParamsSchema,
  SearchClientParams,
  SearchClientParamsSchema,
  SearchConversationsParams,
  SearchConversationsParamsSchema,
} from "./types.js";

export class ClientHubMCPServer {
  private server: McpServer;
  private api: ClientHubApiClient;
  private tools: ClientHubMCPTools;

  constructor(config: ClientHubConfig) {
    this.server = new McpServer({
      name: "client-hub-mcp-server",
      version: "1.0.0",
    });

    this.api = new ClientHubApiClient(config);
    this.tools = new ClientHubMCPTools(this.api);

    this.setupTools();
  }

  static fromEnvironment(): ClientHubMCPServer {
    const config = ClientHubConfigSchema.parse({
      apiBaseUrl:
        process.env.CLIENT_HUB_API_URL || "https://livros.arvore.com.br/api-arvore",
      apiToken: process.env.CLIENT_HUB_API_TOKEN || "",
      requestTimeout: Number.parseInt(
        process.env.CLIENT_HUB_REQUEST_TIMEOUT || "30000",
        10
      ),
    });

    return new ClientHubMCPServer(config);
  }

  private setupTools(): void {
    this.server.registerTool(
      "search_client",
      {
        title: "Search Client",
        description:
          "Search root entities (clients) by name. Returns id, name, type, city, state.",
        inputSchema: {
          query: SearchClientParamsSchema.shape.query,
          limit: SearchClientParamsSchema.shape.limit,
        },
      },
      async (params) => this.tools.searchClient(params as SearchClientParams)
    );

    this.server.registerTool(
      "get_client_360",
      {
        title: "Get Client 360",
        description:
          "Get the aggregated 360 view of a client: deal status/stage, students count, payment, closer, WhatsApp activity.",
        inputSchema: {
          clientId: GetClient360ParamsSchema.shape.clientId,
        },
      },
      async (params) => this.tools.getClient360(params as GetClient360Params)
    );

    this.server.registerTool(
      "list_client_links",
      {
        title: "List Client Source Links",
        description:
          "List the external source links (Pipedrive, WhatsApp, etc.) bound to a client.",
        inputSchema: {
          clientId: ListLinksParamsSchema.shape.clientId,
        },
      },
      async (params) => this.tools.listLinks(params as ListLinksParams)
    );

    this.server.registerTool(
      "search_conversations",
      {
        title: "Search Client Conversations",
        description:
          "Semantic search over a client's conversations across sources (WhatsApp messages and Elephan call transcripts). Optionally filter by source ('whatsapp' or 'elephan'); omit to search all sources. Returns relevant snippets.",
        inputSchema: {
          clientId: SearchConversationsParamsSchema.shape.clientId,
          query: SearchConversationsParamsSchema.shape.query,
          source: SearchConversationsParamsSchema.shape.source,
          limit: SearchConversationsParamsSchema.shape.limit,
        },
      },
      async (params) =>
        this.tools.searchConversations(params as SearchConversationsParams)
    );
  }

  async start(): Promise<void> {
    try {
      const isConnected = await this.api.testConnection();
      if (!isConnected) {
        throw new ClientHubMCPError(
          "Client Hub API connection test failed",
          "CONNECTION_TEST_FAILED"
        );
      }

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error("Client Hub MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start Client Hub MCP Server:",
        error instanceof Error ? error.message : error
      );
      if (error instanceof Error && error.stack) {
        console.error("Stack trace:", error.stack);
      }
      process.exit(1);
    }
  }

  setupGracefulShutdown(): void {
    const shutdown = (signal: string): void => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", (error) => {
      console.error("Uncaught exception:", error);
      process.exit(1);
    });
    process.on("unhandledRejection", (reason) => {
      console.error("Unhandled rejection:", reason);
      process.exit(1);
    });
  }
}
