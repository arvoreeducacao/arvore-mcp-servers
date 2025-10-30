import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MySQLConnection } from "./database.js";
import { MySQLMCPTools } from "./tools.js";
import {
  MySQLConfig,
  MySQLConfigSchema,
  ReadQueryParams,
  DescribeTableParams,
  ReadQueryParamsSchema,
  DescribeTableParamsSchema,
  MySQLMCPError,
} from "./types.js";

export class MySQLMCPServer {
  private server: McpServer;
  private db: MySQLConnection;
  private tools: MySQLMCPTools;

  constructor(config: MySQLConfig) {
    this.server = new McpServer({
      name: "mysql-mcp-server",
      version: "1.0.0",
    });

    this.db = new MySQLConnection(config);
    this.tools = new MySQLMCPTools(this.db);

    this.setupTools();
  }

  static fromEnvironment(): MySQLMCPServer {
    const config = MySQLConfigSchema.parse({
      host: process.env.MYSQL_HOST || "localhost",
      port: parseInt(process.env.MYSQL_PORT || "3306", 10),
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "test",
      ssl: process.env.MYSQL_SSL === "true",
      connectionTimeout: parseInt(
        process.env.MYSQL_CONNECTION_TIMEOUT || "30000",
        10
      ),
    });

    return new MySQLMCPServer(config);
  }

  private setupTools(): void {
    this.server.registerTool(
      "read_query",
      {
        title: "Execute Read Query",
        description: "Execute a SELECT query on the MySQL database",
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
        description: "List all tables in the current database",
        inputSchema: {},
      },
      async () => {
        return this.tools.listTables();
      }
    );

    this.server.registerTool(
      "describe_table",
      {
        title: "Describe Table",
        description:
          "Get the structure and schema information of a specific table",
        inputSchema: { tableName: DescribeTableParamsSchema.shape.tableName },
      },
      async (params) => {
        return this.tools.describeTable(params as DescribeTableParams);
      }
    );

    this.server.registerTool(
      "show_databases",
      {
        title: "Show Databases",
        description: "List all available databases on the MySQL server",
        inputSchema: {},
      },
      async () => {
        return this.tools.showDatabases();
      }
    );
  }

  async start(): Promise<void> {
    try {
      await this.db.connect();

      const isConnected = await this.db.testConnection();
      if (!isConnected) {
        throw new MySQLMCPError(
          "Database connection test failed",
          "CONNECTION_TEST_FAILED"
        );
      }

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error("MySQL MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start MySQL MCP Server:",
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
