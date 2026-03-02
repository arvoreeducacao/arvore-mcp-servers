import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ProxyConfig,
  ProxyConfigSchema,
  UpstreamServerConfigSchema,
  SearchParams,
  SearchParamsSchema,
  CallParams,
  CallParamsSchema,
  McpToolResult,
  ProxyError,
} from "./types.js";
import { ToolRegistry } from "./registry.js";
import { McpConnectorManager } from "./connector.js";
import { HybridSearch } from "./search.js";
import { EmbeddingEngine } from "./embeddings.js";
import { OutputShaper } from "./output-shaper.js";
import { PaginationManager } from "./pagination.js";
import { AuditLogger } from "./logger.js";

export class McpProxyServer {
  private readonly server: McpServer;
  private readonly registry: ToolRegistry;
  private readonly connector: McpConnectorManager;
  private readonly search: HybridSearch;
  private readonly embeddings: EmbeddingEngine;
  private readonly shaper: OutputShaper;
  private readonly pagination: PaginationManager;
  private readonly logger: AuditLogger;
  private readonly config: ProxyConfig;
  private upstreamsReady: Promise<void> = Promise.resolve();

  constructor(config: ProxyConfig) {
    this.config = config;
    this.server = new McpServer({
      name: "mcp-proxy-gateway",
      version: "1.0.0",
    });

    this.embeddings = new EmbeddingEngine();
    this.registry = new ToolRegistry(this.embeddings);
    this.connector = new McpConnectorManager(this.registry);
    this.search = new HybridSearch(this.registry, this.embeddings);
    this.shaper = new OutputShaper(config.callItemLimit, config.maxTextLength);
    this.pagination = new PaginationManager();
    this.logger = new AuditLogger();

    this.setupTools();
  }

  static fromEnvironment(): McpProxyServer {
      const upstreamsRaw = process.env.MCP_PROXY_UPSTREAMS;
      if (!upstreamsRaw) {
        throw new ProxyError(
          "MCP_PROXY_UPSTREAMS environment variable is required (JSON array of upstream configs)",
          "MISSING_CONFIG"
        );
      }

      const expanded = upstreamsRaw.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || "");

      let upstreams;
      try {
        const parsed = JSON.parse(expanded);
        upstreams = Array.isArray(parsed)
          ? parsed.map((u: unknown) => UpstreamServerConfigSchema.parse(u))
          : [UpstreamServerConfigSchema.parse(parsed)];
      } catch (error) {
        throw new ProxyError(
          `Invalid MCP_PROXY_UPSTREAMS: ${error instanceof Error ? error.message : error}`,
          "INVALID_CONFIG"
        );
      }

      const config = ProxyConfigSchema.parse({
        upstreams,
        searchLimit: parseInt(process.env.MCP_PROXY_SEARCH_LIMIT || "8", 10),
        callItemLimit: parseInt(process.env.MCP_PROXY_CALL_ITEM_LIMIT || "20", 10),
        maxTextLength: parseInt(process.env.MCP_PROXY_MAX_TEXT_LENGTH || "500", 10),
        maxOutputTokens: parseInt(process.env.MCP_PROXY_MAX_OUTPUT_TOKENS || "8000", 10),
      });

      return new McpProxyServer(config);
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
      async (params) => this.handleSearch(params as SearchParams)
    );

    this.server.registerTool(
      "mcp_call",
      {
        title: "Call MCP Tool",
        description:
          "Execute a tool on an upstream MCP server. Use the ref from mcp_search results. Returns normalized, token-efficient output with pagination support.",
        inputSchema: {
          ref: CallParamsSchema.shape.ref,
          args: CallParamsSchema.shape.args,
          page_cursor: CallParamsSchema.shape.page_cursor,
          detail: CallParamsSchema.shape.detail,
        },
      },
      async (params) => this.handleCall(params as CallParams)
    );
  }

  private async handleSearch(params: SearchParams): Promise<McpToolResult> {
    await this.upstreamsReady;
    const audit = this.logger.createEntry({
      tool: "mcp_search",
      provider: "*",
      args: params as unknown as Record<string, unknown>,
    });

    try {
      const limit = params.limit || this.config.searchLimit;
      const results = await this.search.search(params.query, limit);

      const output = JSON.stringify({ results }, null, 2);
      this.logger.finalize(audit, {
        outputSize: output.length,
        itemCount: results.length,
      });

      return { content: [{ type: "text", text: output }] };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      this.logger.finalize(audit, { outputSize: 0, error: msg });
      return {
        content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
      };
    }
  }

  private async handleCall(params: CallParams): Promise<McpToolResult> {
    await this.upstreamsReady;
    if (params.page_cursor) {
      return this.handlePaginatedCall(params);
    }

    const entry = this.registry.get(params.ref);
    if (!entry) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: `Tool not found: ${params.ref}. Use mcp_search to discover available tools.`,
            }),
          },
        ],
      };
    }

    const audit = this.logger.createEntry({
      tool: "mcp_call",
      provider: entry.provider,
      args: params.args,
    });

    try {
      const rawResult = await this.connector.callTool(
        entry.provider,
        entry.originalName,
        params.args
      );

      const { items, hasMore } = this.shaper.shapeResponse(
        rawResult,
        entry.provider,
        params.detail
      );

      let nextCursor: string | null = null;
      if (hasMore) {
        nextCursor = this.pagination.create({
          ref: params.ref,
          args: params.args,
          provider: entry.provider,
          originalName: entry.originalName,
          page: 2,
        });
      }

      const output = JSON.stringify(
        { items, next_cursor: nextCursor },
        null,
        2
      );
      const truncated = this.enforceTokenLimit(output);

      this.logger.finalize(audit, {
        outputSize: truncated.length,
        itemCount: items.length,
      });

      return { content: [{ type: "text", text: truncated }] };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      this.logger.finalize(audit, { outputSize: 0, error: msg });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: msg, ref: params.ref }),
          },
        ],
      };
    }
  }

  private async handlePaginatedCall(
    params: CallParams
  ): Promise<McpToolResult> {
    const state = this.pagination.resolve(params.page_cursor!);
    if (!state) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error:
                "Pagination cursor expired or invalid. Please re-execute the original query.",
            }),
          },
        ],
      };
    }

    const audit = this.logger.createEntry({
      tool: "mcp_call",
      provider: state.provider,
      args: state.args,
    });

    try {
      const rawResult = await this.connector.callTool(
        state.provider,
        state.originalName,
        state.args
      );

      const { items, hasMore } = this.shaper.shapeResponse(
        rawResult,
        state.provider,
        params.detail
      );

      let nextCursor: string | null = null;
      if (hasMore) {
        nextCursor = this.pagination.create({
          ...state,
          page: state.page + 1,
        });
      }

      const output = JSON.stringify(
        { items, next_cursor: nextCursor },
        null,
        2
      );
      const truncated = this.enforceTokenLimit(output);

      this.logger.finalize(audit, {
        outputSize: truncated.length,
        itemCount: items.length,
      });

      return { content: [{ type: "text", text: truncated }] };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      this.logger.finalize(audit, { outputSize: 0, error: msg });
      return {
        content: [
          { type: "text", text: JSON.stringify({ error: msg }) },
        ],
      };
    }
  }

  private enforceTokenLimit(output: string): string {
    const maxChars = this.config.maxOutputTokens * 4;
    if (output.length <= maxChars) return output;
    const truncated = output.slice(0, maxChars - 200);
    return JSON.stringify({
      truncated: true,
      originalLength: output.length,
      content: truncated,
    });
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("[proxy] MCP transport connected, loading upstreams in background...");

      this.upstreamsReady = (async () => {
        await this.embeddings.init();
        await this.connector.connectAll(this.config.upstreams);
        console.error(
          `[proxy] Registry loaded: ${this.registry.size} tools from ${this.connector.connectedProviders.length} providers`
        );
        console.error(
          `[proxy] Semantic search: ${this.embeddings.isReady() ? "enabled" : "disabled (lexical fallback)"}`
        );
        console.error("[proxy] Exposing 2 tools: mcp_search, mcp_call");
      })();

      this.upstreamsReady.catch((error) => {
        console.error("[proxy] Background upstream connection failed:", error instanceof Error ? error.message : error);
      });
    } catch (error) {
      console.error(
        "[proxy] Failed to start:",
        error instanceof Error ? error.message : error
      );
      await this.cleanup();
      process.exit(1);
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.connector.disconnectAll();
    } catch (error) {
      console.error(
        "[proxy] Error during cleanup:",
        error instanceof Error ? error.message : error
      );
    }
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`[proxy] Received ${signal}, shutting down...`);
      await this.cleanup();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", async (error) => {
      console.error("[proxy] Uncaught exception:", error);
      await this.cleanup();
      process.exit(1);
    });
    process.on("unhandledRejection", async (reason) => {
      console.error("[proxy] Unhandled rejection:", reason);
      await this.cleanup();
      process.exit(1);
    });
  }
}
