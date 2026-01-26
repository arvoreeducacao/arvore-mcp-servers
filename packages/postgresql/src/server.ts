import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PostgreSQLConnection } from "./database.js";
import { PostgreSQLMCPTools } from "./tools.js";
import {
  PostgreSQLConfig,
  PostgreSQLConfigSchema,
  ReadQueryParams,
  DescribeTableParams,
  ReadQueryParamsSchema,
  DescribeTableParamsSchema,
  PostgreSQLMCPError,
} from "./types.js";

export class PostgreSQLMCPServer {
  private server: McpServer;
  private db: PostgreSQLConnection;
  private tools: PostgreSQLMCPTools;

  constructor(config: PostgreSQLConfig) {
    this.server = new McpServer({
      name: "postgresql-mcp-server",
      version: "1.0.0",
    });

    this.db = new PostgreSQLConnection(config);
    this.tools = new PostgreSQLMCPTools(this.db);

    this.setupTools();
  }

  static fromEnvironment(): PostgreSQLMCPServer {
    const config = PostgreSQLConfigSchema.parse({
      host: process.env.POSTGRESQL_HOST || "localhost",
      port: parseInt(process.env.POSTGRESQL_PORT || "5432", 10),
      user: process.env.POSTGRESQL_USER || "postgres",
      password: process.env.POSTGRESQL_PASSWORD || "",
      database: process.env.POSTGRESQL_DATABASE || "postgres",
      ssl: process.env.POSTGRESQL_SSL === "true",
      connectionTimeout: parseInt(
        process.env.POSTGRESQL_CONNECTION_TIMEOUT || "30000",
        10
      ),
    });

    return new PostgreSQLMCPServer(config);
  }

  private setupTools(): void {
    this.server.registerTool(
      "read_query",
      {
        title: "Execute Read Query",
        description: "Execute a SELECT query on the PostgreSQL database",
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
        description: "List all tables in the specified schema (default: public)",
        inputSchema: {
          schemaName: z.string().optional().default("public"),
        },
      },
      async (params) => {
        return this.tools.listTables(
          (params as { schemaName?: string }).schemaName
        );
      }
    );

    this.server.registerTool(
      "describe_table",
      {
        title: "Describe Table",
        description:
          "Get the structure and schema information of a specific table",
        inputSchema: {
          tableName: DescribeTableParamsSchema.shape.tableName,
          schemaName: DescribeTableParamsSchema.shape.schemaName,
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
        description: "List all available databases on the PostgreSQL server",
        inputSchema: {},
      },
      async () => {
        return this.tools.listDatabases();
      }
    );

    this.server.registerTool(
      "list_schemas",
      {
        title: "List Schemas",
        description: "List all schemas in the current database",
        inputSchema: {},
      },
      async () => {
        return this.tools.listSchemas();
      }
    );
  }

  async start(): Promise<void> {
    try {
      await this.db.connect();

      const isConnected = await this.db.testConnection();
      if (!isConnected) {
        throw new PostgreSQLMCPError(
          "Database connection test failed",
          "CONNECTION_TEST_FAILED"
        );
      }

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error("PostgreSQL MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start PostgreSQL MCP Server:",
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
