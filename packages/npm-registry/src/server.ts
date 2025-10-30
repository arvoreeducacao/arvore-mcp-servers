import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { NPMClient } from "./npm-client.js";
import { NPMMCPTools } from "./tools.js";
import {
  PackageInfoParamsSchema,
  PackageDownloadsParamsSchema,
  PackageSearchParamsSchema,
} from "./types.js";

export class NPMMCPServer {
  private server: McpServer;
  private npmClient: NPMClient;
  private tools: NPMMCPTools;

  constructor() {
    this.server = new McpServer({
      name: "npm-mcp-server",
      version: "1.0.0",
    });

    this.npmClient = new NPMClient();
    this.tools = new NPMMCPTools(this.npmClient);

    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool(
      "get_package_info",
      {
        title: "Get Package Information",
        description:
          "Get detailed information about an NPM package including metadata, dependencies, and versions",
        inputSchema: PackageInfoParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = PackageInfoParamsSchema.parse(params);
        return this.tools.getPackageInfo(validatedParams);
      }
    );

    this.server.registerTool(
      "get_package_downloads",
      {
        title: "Get Package Download Statistics",
        description:
          "Get download statistics for an NPM package from the last week",
        inputSchema: PackageDownloadsParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = PackageDownloadsParamsSchema.parse(params);
        return this.tools.getPackageDownloads(validatedParams);
      }
    );

    this.server.registerTool(
      "search_packages",
      {
        title: "Search NPM Packages",
        description:
          "Search for NPM packages by query string with optional size limit",
        inputSchema: PackageSearchParamsSchema.shape,
      },
      async (params) => {
        const validatedParams = PackageSearchParamsSchema.parse(params);
        return this.tools.searchPackages(validatedParams);
      }
    );
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("NPM MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start NPM MCP Server:",
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
