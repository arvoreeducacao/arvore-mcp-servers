import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  CallParamsSchema,
  SearchParamsSchema,
  SchemaParamsSchema,
  type McpToolResult,
} from "./types.js";
import { readLock, isProcessAlive } from "./singleton.js";

export class BridgeServer {
  private readonly server: McpServer;
  private client: Client | null = null;
  private clientPromise: Promise<Client> | null = null;
  private readonly primaryUrl: string;

  constructor(port: number) {
    this.primaryUrl = `http://127.0.0.1:${port}/mcp`;
    this.server = new McpServer({
      name: "mcp-proxy-bridge",
      version: "1.0.0",
    });
    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool(
      "mcp_search",
      {
        title: "Search MCP Tools",
        description:
          "Discover available tools across all connected MCP servers. Returns a short list of relevant tools with refs and usage hints. Use this before mcp_call to find the right tool.",
        inputSchema: {
          query: SearchParamsSchema.shape.query,
          limit: SearchParamsSchema.shape.limit,
        },
      },
      async (params) => this.forward("mcp_search", params),
    );

    this.server.registerTool(
      "mcp_call",
      {
        title: "Call MCP Tool",
        description: [
          "Execute a tool on an upstream MCP server. Use the ref from mcp_search results. Returns normalized, token-efficient output with pagination support.",
          "",
          "IMPORTANT — Output shaping behavior:",
          "• By default (detail=false), the proxy STRIPS metadata fields (id, url, created_at, updated_at, etc.), TRUNCATES text fields to 500 chars, and LIMITS arrays to 5 items. This saves tokens but may hide important data.",
          "• When detail=true, ALL fields are preserved (nothing is stripped), text fields are truncated at 1500 chars, and arrays are returned in full. Use this when you need complete data — e.g. thread messages, full API responses, or when default output seems incomplete.",
          "",
          "Rule of thumb: if the default call returns fewer items or less data than expected, retry with detail=true.",
        ].join("\n"),
        inputSchema: {
          ref: CallParamsSchema.shape.ref,
          args: CallParamsSchema.shape.args,
          page_cursor: CallParamsSchema.shape.page_cursor,
          detail: CallParamsSchema.shape.detail,
        },
      },
      async (params) => this.forward("mcp_call", params),
    );

    this.server.registerTool(
      "mcp_schema",
      {
        title: "Get Tool Schema",
        description:
          "Get the full input schema for a tool. Use the ref from mcp_search results to see all parameters, types, and required fields before calling mcp_call.",
        inputSchema: {
          ref: SchemaParamsSchema.shape.ref,
        },
      },
      async (params) => this.forward("mcp_schema", params),
    );
  }

  private async ensureClient(): Promise<Client> {
    if (this.client) return this.client;
    if (this.clientPromise) return this.clientPromise;

    this.clientPromise = (async () => {
      const url = new URL(this.primaryUrl);
      let client = new Client({
        name: "mcp-proxy-bridge-client",
        version: "1.0.0",
      });

      try {
        const transport = new StreamableHTTPClientTransport(url);
        await client.connect(transport);
      } catch {
        console.error("[bridge] StreamableHTTP failed, trying SSE...");
        client = new Client({
          name: "mcp-proxy-bridge-client",
          version: "1.0.0",
        });
        const sseTransport = new SSEClientTransport(url);
        await client.connect(sseTransport);
      }

      console.error(`[bridge] Connected to primary at ${this.primaryUrl}`);
      this.client = client;
      return client;
    })().catch((err) => {
      this.clientPromise = null;
      throw err;
    });

    return this.clientPromise;
  }

  private isPrimaryAlive(): boolean {
    const lock = readLock();
    if (!lock) return false;
    return isProcessAlive(lock.pid);
  }

  private async forward(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    try {
      const client = await this.ensureClient();
      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });

      if (result.content && Array.isArray(result.content)) {
        return { content: result.content as McpToolResult["content"] };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[bridge] Forward failed: ${msg}`);

      this.client = null;
      this.clientPromise = null;

      const primaryAlive = this.isPrimaryAlive();
      const hint = primaryAlive
        ? "Primary is alive but unreachable. Retrying may help."
        : "Primary process is dead. Please restart the MCP proxy — the next instance will auto-promote to primary.";

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `Bridge forward failed: ${msg}`,
              primaryAlive,
              hint,
            }),
          },
        ],
      };
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`[bridge] Stdio transport connected, forwarding to primary at ${this.primaryUrl}`);
  }

  async cleanup(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
      this.client = null;
      this.clientPromise = null;
      }
    } catch (error) {
      console.error(
        "[bridge] Error during cleanup:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`[bridge] Received ${signal}, shutting down...`);
      await this.cleanup();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }
}
