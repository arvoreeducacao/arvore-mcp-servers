import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MetabaseClient } from "./metabase-client.js";
import { MetabaseMCPTools } from "./tools.js";
import {
    MetabaseConfig,
    MetabaseConfigSchema,
    MetabaseMCPError,
    ListCardsParamsSchema,
    GetCardParamsSchema,
    CreateCardParamsSchema,
    UpdateCardParamsSchema,
    DeleteCardParamsSchema,
    RunCardQueryParamsSchema,
    GetDashboardParamsSchema,
    CreateDashboardParamsSchema,
    AddCardToDashboardParamsSchema,
    DeleteDashboardParamsSchema,
    GetCollectionItemsParamsSchema,
    ListCollectionsParamsSchema,
    CreateCollectionParamsSchema, RunQueryParamsSchema,
    ListTablesParamsSchema
} from "./types.js";

export class MetabaseMCPServer {
  private server: McpServer;
  private client: MetabaseClient;
  private tools: MetabaseMCPTools;

  constructor(config: MetabaseConfig) {
    this.server = new McpServer({
      name: "metabase-mcp-server",
      version: "1.0.0",
    });

    this.client = new MetabaseClient(config);
    this.tools = new MetabaseMCPTools(this.client);

    this.setupTools();
  }

  static fromEnvironment(): MetabaseMCPServer {
    const config = MetabaseConfigSchema.parse({
      url: process.env.METABASE_URL || "",
      apiKey: process.env.METABASE_API_KEY || "",
    });

    return new MetabaseMCPServer(config);
  }

  private setupTools(): void {
    this.server.registerTool(
      "list_cards",
      {
        title: "List Metabase Cards",
        description: "List all cards (questions/reports) in Metabase",
        inputSchema: {
          filter: ListCardsParamsSchema.shape.filter,
        },
      },
      async (params) => this.tools.listCards(params as any)
    );

    this.server.registerTool(
      "get_card",
      {
        title: "Get Metabase Card",
        description: "Get details of a specific card by ID",
        inputSchema: {
          id: GetCardParamsSchema.shape.id,
        },
      },
      async (params) => this.tools.getCard(params as any)
    );

    this.server.registerTool(
      "create_card",
      {
        title: "Create Metabase Card",
        description: "Create a new card (question/report) with a query and visualization type",
        inputSchema: {
          name: CreateCardParamsSchema.shape.name,
          dataset_query: CreateCardParamsSchema.shape.dataset_query,
          display: CreateCardParamsSchema.shape.display,
          description: CreateCardParamsSchema.shape.description,
          collection_id: CreateCardParamsSchema.shape.collection_id,
          visualization_settings: CreateCardParamsSchema.shape.visualization_settings,
        },
      },
      async (params) => this.tools.createCard(params as any)
    );

    this.server.registerTool(
      "update_card",
      {
        title: "Update Metabase Card",
        description: "Update an existing card's name, description, display type or visualization settings",
        inputSchema: {
          id: UpdateCardParamsSchema.shape.id,
          name: UpdateCardParamsSchema.shape.name,
          description: UpdateCardParamsSchema.shape.description,
          display: UpdateCardParamsSchema.shape.display,
          visualization_settings: UpdateCardParamsSchema.shape.visualization_settings,
        },
      },
      async (params) => this.tools.updateCard(params as any)
    );

    this.server.registerTool(
      "delete_card",
      {
        title: "Delete Metabase Card",
        description: "Delete a card by ID",
        inputSchema: {
          id: DeleteCardParamsSchema.shape.id,
        },
      },
      async (params) => this.tools.deleteCard(params as any)
    );

    this.server.registerTool(
      "run_card_query",
      {
        title: "Run Card Query",
        description: "Execute a saved card's query and return results",
        inputSchema: {
          id: RunCardQueryParamsSchema.shape.id,
          parameters: RunCardQueryParamsSchema.shape.parameters,
        },
      },
      async (params) => this.tools.runCardQuery(params as any)
    );

    this.server.registerTool(
      "list_dashboards",
      {
        title: "List Metabase Dashboards",
        description: "List all dashboards in Metabase",
        inputSchema: {},
      },
      async () => this.tools.listDashboards()
    );

    this.server.registerTool(
      "get_dashboard",
      {
        title: "Get Metabase Dashboard",
        description: "Get details of a specific dashboard including its cards",
        inputSchema: {
          id: GetDashboardParamsSchema.shape.id,
        },
      },
      async (params) => this.tools.getDashboard(params as any)
    );

    this.server.registerTool(
      "create_dashboard",
      {
        title: "Create Metabase Dashboard",
        description: "Create a new empty dashboard",
        inputSchema: {
          name: CreateDashboardParamsSchema.shape.name,
          description: CreateDashboardParamsSchema.shape.description,
          collection_id: CreateDashboardParamsSchema.shape.collection_id,
          parameters: CreateDashboardParamsSchema.shape.parameters,
        },
      },
      async (params) => this.tools.createDashboard(params as any)
    );

    this.server.registerTool(
      "add_card_to_dashboard",
      {
        title: "Add Card to Dashboard",
        description: "Add an existing card to a dashboard at a specific grid position",
        inputSchema: {
          dashboard_id: AddCardToDashboardParamsSchema.shape.dashboard_id,
          card_id: AddCardToDashboardParamsSchema.shape.card_id,
          row: AddCardToDashboardParamsSchema.shape.row,
          col: AddCardToDashboardParamsSchema.shape.col,
          size_x: AddCardToDashboardParamsSchema.shape.size_x,
          size_y: AddCardToDashboardParamsSchema.shape.size_y,
        },
      },
      async (params) => this.tools.addCardToDashboard(params as any)
    );

    this.server.registerTool(
      "delete_dashboard",
      {
        title: "Delete Metabase Dashboard",
        description: "Delete a dashboard by ID",
        inputSchema: {
          id: DeleteDashboardParamsSchema.shape.id,
        },
      },
      async (params) => this.tools.deleteDashboard(params as any)
    );

    this.server.registerTool(
      "get_collection_items",
      {
        title: "Get Collection Items",
        description: "List all items (cards, dashboards, sub-collections) inside a specific collection",
        inputSchema: {
          id: GetCollectionItemsParamsSchema.shape.id,
        },
      },
      async (params) => this.tools.getCollectionItems(params as any)
    );

    this.server.registerTool(
      "list_collections",
      {
        title: "List Metabase Collections",
        description: "List all collections (folders) in Metabase",
        inputSchema: {
          namespace: ListCollectionsParamsSchema.shape.namespace,
        },
      },
      async (params) => this.tools.listCollections(params as any)
    );

    this.server.registerTool(
      "create_collection",
      {
        title: "Create Metabase Collection",
        description: "Create a new collection (folder) to organize cards and dashboards",
        inputSchema: {
          name: CreateCollectionParamsSchema.shape.name,
          description: CreateCollectionParamsSchema.shape.description,
          parent_id: CreateCollectionParamsSchema.shape.parent_id,
          color: CreateCollectionParamsSchema.shape.color,
        },
      },
      async (params) => this.tools.createCollection(params as any)
    );

    this.server.registerTool(
      "list_databases",
      {
        title: "List Metabase Databases",
        description: "List all databases connected to Metabase",
        inputSchema: {},
      },
      async () => this.tools.listDatabases()
    );

    this.server.registerTool(
      "run_query",
      {
        title: "Run SQL Query",
        description: "Execute a native SQL query against a specific database",
        inputSchema: {
          database: RunQueryParamsSchema.shape.database,
          query: RunQueryParamsSchema.shape.query,
        },
      },
      async (params) => this.tools.runQuery(params as any)
    );

    this.server.registerTool(
      "list_tables",
      {
        title: "List Database Tables",
        description: "List all tables in a specific database",
        inputSchema: {
          database_id: ListTablesParamsSchema.shape.database_id,
        },
      },
      async (params) => this.tools.listTables(params as any)
    );
  }

  async start(): Promise<void> {
    try {
      const isConnected = await this.client.testConnection();
      if (!isConnected) {
        throw new MetabaseMCPError(
          "Metabase API connection test failed. Please check your URL and API key.",
          "CONNECTION_TEST_FAILED"
        );
      }

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error("Metabase MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start Metabase MCP Server:",
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
