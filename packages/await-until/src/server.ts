import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  AwaitCommandSchema,
  AwaitUrlSchema,
  AwaitFileSchema,
  AwaitMcpSchema,
} from "./types.js";
import { pollCommand, pollUrl, pollFile, pollMcp } from "./pollers.js";
import type { PollResult } from "./types.js";

function formatResult(result: PollResult) {
  const status = result.success ? "✅ Condition met" : "❌ Condition not met";
  const lines = [
    status,
    `Attempts: ${result.attempts}`,
    `Elapsed: ${result.elapsed_seconds}s`,
  ];
  if (result.last_output) lines.push(`Output: ${result.last_output}`);
  if (result.error) lines.push(`Error: ${result.error}`);

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    isError: !result.success,
  };
}

export class AwaitUntilMCPServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "await-until-mcp-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool(
      "await_until_command",
      {
        title: "Await Until Command",
        description:
          "Repeatedly executes a shell command at a given interval until the output matches a condition or times out. Use this to wait for processes to start, services to become ready, logs to appear, deployments to complete, etc.",
        inputSchema: AwaitCommandSchema.shape,
      },
      async (params) => {
        const validated = AwaitCommandSchema.parse(params);
        if (
          ["contains", "not_contains", "equals", "not_equals", "regex"].includes(validated.match) &&
          !validated.pattern
        ) {
          return {
            content: [{ type: "text" as const, text: `Error: 'pattern' is required when match is '${validated.match}'` }],
            isError: true,
          };
        }
        const result = await pollCommand(validated);
        return formatResult(result);
      }
    );

    this.server.registerTool(
      "await_until_url",
      {
        title: "Await Until URL",
        description:
          "Polls an HTTP endpoint at a given interval until it returns the expected status code and/or body content, or times out. Use this to wait for services, APIs, or health checks to become available.",
        inputSchema: AwaitUrlSchema.shape,
      },
      async (params) => {
        const validated = AwaitUrlSchema.parse(params);
        const result = await pollUrl(validated);
        return formatResult(result);
      }
    );

    this.server.registerTool(
      "await_until_file",
      {
        title: "Await Until File",
        description:
          "Polls the filesystem at a given interval until a file exists, disappears, or contains expected content. Use this to wait for build artifacts, log files, lock files, etc.",
        inputSchema: AwaitFileSchema.shape,
      },
      async (params) => {
        const validated = AwaitFileSchema.parse(params);
        if (
          ["contains", "regex"].includes(validated.match) &&
          !validated.pattern
        ) {
          return {
            content: [{ type: "text" as const, text: `Error: 'pattern' is required when match is '${validated.match}'` }],
            isError: true,
          };
        }
        const result = await pollFile(validated);
        return formatResult(result);
      }
    );

    this.server.registerTool(
      "await_until_mcp",
      {
        title: "Await Until MCP",
        description:
          "Polls another MCP server's tool at a given interval until the result matches a condition or times out. Reads your mcp.json config (Kiro, Cursor, Claude Desktop) to discover and spawn the target MCP server, then calls the specified tool repeatedly. Use this to wait for conditions that can only be checked via other MCP tools (e.g. database state, Datadog metrics, LaunchDarkly flags, Slack messages).",
        inputSchema: AwaitMcpSchema.shape,
      },
      async (params) => {
        const validated = AwaitMcpSchema.parse(params);
        if (
          ["contains", "not_contains", "equals", "not_equals", "regex"].includes(validated.match) &&
          !validated.pattern
        ) {
          return {
            content: [{ type: "text" as const, text: `Error: 'pattern' is required when match is '${validated.match}'` }],
            isError: true,
          };
        }
        const result = await pollMcp(validated);
        return formatResult(result);
      }
    );
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("✅ Await-Until MCP Server started");
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
