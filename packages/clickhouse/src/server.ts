import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ClickHouseConnection } from "./database.js";
import { ClickHouseMCPTools } from "./tools.js";
import {
  ClickHouseConfig,
  ClickHouseConfigSchema,
  ReadQueryParams,
  DescribeTableParams,
  ReadQueryParamsSchema,
  DescribeTableParamsSchema,
  ClickHouseMCPError,
} from "./types.js";

export class ClickHouseMCPServer {
  private server: McpServer;
  private db: ClickHouseConnection;
  private tools: ClickHouseMCPTools;

  constructor(config: ClickHouseConfig) {
    this.server = new McpServer({
      name: "clickhouse-mcp-server",
      version: "1.0.0",
    });

    this.db = new ClickHouseConnection(config);
    this.tools = new ClickHouseMCPTools(this.db);

    this.setupTools();
  }

  static fromEnvironment(): ClickHouseMCPServer {
    const config = ClickHouseConfigSchema.parse({
      url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
      username: process.env.CLICKHOUSE_USER || "default",
      password: process.env.CLICKHOUSE_PASSWORD || "",
      database: process.env.CLICKHOUSE_DATABASE || "default",
      requestTimeout: parseInt(
        process.env.CLICKHOUSE_REQUEST_TIMEOUT || "30000",
        10
      ),
    });

    return new ClickHouseMCPServer(config);
  }

  private setupTools(): void {
    this.server.registerTool(
      "read_query",
      {
        title: "Execute Read Query",
        description: "Execute a read-only SQL query on the ClickHouse database",
        inputSchema: { query: ReadQueryParamsSchema.shape.query },
      },
      async (params) => {
        return this.tools.readQuery(params as ReadQueryParams);
      }
    );

    this.server.registerTool(
      "list_tables",
      {
        title: "List Tables",
        description:
          "List all tables in the specified database (defaults to the configured database)",
        inputSchema: {
          database: z.string().optional(),
        },
      },
      async (params) => {
        return this.tools.listTables(
          (params as { database?: string }).database
        );
      }
    );

    this.server.registerTool(
      "describe_table",
      {
        title: "Describe Table",
        description:
          "Get the column structure of a specific table including types, keys, and defaults",
        inputSchema: {
          tableName: DescribeTableParamsSchema.shape.tableName,
          database: DescribeTableParamsSchema.shape.database,
        },
      },
      async (params) => {
        return this.tools.describeTable(params as DescribeTableParams);
      }
    );

    this.server.registerTool(
      "list_databases",
      {
        title: "List Databases",
        description: "List all available databases on the ClickHouse server",
        inputSchema: {},
      },
      async () => {
        return this.tools.listDatabases();
      }
    );
  }

  async start(): Promise<void> {
    try {
      await this.db.connect();

      const isConnected = await this.db.testConnection();
      if (!isConnected) {
        throw new ClickHouseMCPError(
          "Database connection test failed",
          "CONNECTION_TEST_FAILED"
        );
      }

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error("ClickHouse MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start ClickHouse MCP Server:",
        error instanceof Error ? error.message : error
      );
      if (error instanceof Error && error.stack) {
        console.error("Stack trace:", error.stack);
      }
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
