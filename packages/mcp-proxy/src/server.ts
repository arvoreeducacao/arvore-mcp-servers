import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpConnectorManager } from "./connector.js";
import { Dashboard } from "./dashboard.js";
import { EmbeddingEngine } from "./embeddings.js";
import { AuditLogger } from "./logger.js";
import { OutputShaper } from "./output-shaper.js";
import { PaginationManager } from "./pagination.js";
import { ToolRegistry } from "./registry.js";
import { HybridSearch } from "./search.js";
import {
  type CallParams,
  CallParamsSchema,
  type McpToolResult,
  type ProxyConfig,
  ProxyConfigSchema,
  ProxyError,
  SchemaParamsSchema,
  type SearchParams,
  SearchParamsSchema,
  UpstreamServerConfigSchema,
} from "./types.js";

export class McpProxyServer {
  private readonly server: McpServer;
  private readonly registry: ToolRegistry;
  private readonly connector: McpConnectorManager;
  private readonly search: HybridSearch;
  private readonly embeddings: EmbeddingEngine;
  private readonly shaper: OutputShaper;
  private readonly pagination: PaginationManager;
  private readonly logger: AuditLogger;
  private readonly dashboard: Dashboard;
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
    this.dashboard = new Dashboard(
      this.connector,
      this.registry,
      this.logger,
      parseInt(process.env.MCP_PROXY_DASHBOARD_PORT || "9100", 10),
    );

    this.setupTools();
  }

  static fromEnvironment(): McpProxyServer {
    const upstreamsRaw = process.env.MCP_PROXY_UPSTREAMS;
    if (!upstreamsRaw) {
      throw new ProxyError(
        "MCP_PROXY_UPSTREAMS environment variable is required (JSON array of upstream configs)",
        "MISSING_CONFIG",
      );
    }

    const expanded = upstreamsRaw.replace(
      /\$\{(\w+)\}/g,
      (_, key) => process.env[key] || "",
    );

    let upstreams;
    try {
      const parsed = JSON.parse(expanded);
      upstreams = Array.isArray(parsed)
        ? parsed.map((u: unknown) => UpstreamServerConfigSchema.parse(u))
        : [UpstreamServerConfigSchema.parse(parsed)];
    } catch (error) {
      throw new ProxyError(
        `Invalid MCP_PROXY_UPSTREAMS: ${error instanceof Error ? error.message : error}`,
        "INVALID_CONFIG",
      );
    }

    const config = ProxyConfigSchema.parse({
      upstreams,
      searchLimit: parseInt(process.env.MCP_PROXY_SEARCH_LIMIT || "3", 10),
      callItemLimit: parseInt(
        process.env.MCP_PROXY_CALL_ITEM_LIMIT || "20",
        10,
      ),
      maxTextLength: parseInt(
        process.env.MCP_PROXY_MAX_TEXT_LENGTH || "500",
        10,
      ),
      maxOutputTokens: parseInt(
        process.env.MCP_PROXY_MAX_OUTPUT_TOKENS || "8000",
        10,
      ),
      idleTimeoutMs: parseInt(
        process.env.MCP_PROXY_IDLE_TIMEOUT_MS || String(5 * 60 * 1000),
        10,
      ),
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
      async (params) => this.handleSearch(params as SearchParams),
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
      async (params) => this.handleCall(params as CallParams),
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
      async (params) => this.handleSchema(params as { ref: string }),
    );
  }

  private async handleSchema(params: { ref: string }): Promise<McpToolResult> {
    await this.upstreamsReady;
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

    const schema = entry._inputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
    };

    const properties = schema.properties || {};
    const required = new Set(schema.required || []);

    const lines: string[] = [
      `ref = "${entry.ref}"`,
      `title = "${entry.title}"`,
      `description = "${this.escapeToml(entry.description)}"`,
      "",
    ];

    for (const [name, def] of Object.entries(properties)) {
      const prop = def as {
        type?: string;
        description?: string;
        default?: unknown;
        enum?: unknown[];
      };
      const req = required.has(name) ? "required" : "optional";
      const type = prop.type || "unknown";
      lines.push(`[params.${name}]`);
      lines.push(`type = "${type}"`);
      lines.push(`status = "${req}"`);
      if (prop.description) {
        lines.push(
          `desc = "${this.escapeToml(this.truncateText(prop.description, 80))}"`,
        );
      }
      if (prop.default !== undefined) {
        lines.push(`default = ${JSON.stringify(prop.default)}`);
      }
      if (prop.enum) {
        lines.push(`enum = ${JSON.stringify(prop.enum)}`);
      }
      lines.push("");
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
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

      const output = results
        .map(
          (r) =>
            `[[results]]\nref = "${r.ref}"\ntitle = "${r.title}"\nhint = "${this.escapeToml(r.hint)}"`,
        )
        .join("\n\n");
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
        params.args,
      );

      if (rawResult && typeof rawResult === "object") {
        const maybeRaw = (rawResult as Record<string, unknown>)["_rawContent"];
        const isValidRawContent =
          Array.isArray(maybeRaw) &&
          maybeRaw.every((part) => {
            if (!part || typeof part !== "object") return false;
            const p = part as Record<string, unknown>;
            if (p.type === "text") return typeof p.text === "string";
            if (p.type === "image")
              return (
                typeof p.data === "string" && typeof p.mimeType === "string"
              );
            return false;
          });
        if (isValidRawContent) {
          const content = maybeRaw as McpToolResult["content"];
          this.logger.finalize(audit, {
            outputSize: content.length,
            itemCount: content.length,
          });
          return { content };
        }
      }

      const { items, hasMore } = this.shaper.shapeResponse(
        rawResult,
        entry.provider,
        params.detail,
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
        2,
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
    params: CallParams,
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
        state.args,
      );

      const offset = (state.page - 1) * this.config.callItemLimit;
      const { items, hasMore } = this.shaper.shapeResponse(
        rawResult,
        state.provider,
        params.detail,
        offset,
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
        2,
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
        content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
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

  private escapeToml(value: string): string {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");
  }

  private truncateText(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + "…";
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error(
        "[proxy] MCP transport connected, discovering upstreams in background...",
      );
      this.dashboard.start();

      this.upstreamsReady = (async () => {
        await this.embeddings.init();
        await this.connector.discoverAll(this.config.upstreams);
        this.connector.startIdleReaper(this.config.idleTimeoutMs);
        console.error(
          `[proxy] Registry loaded: ${this.registry.size} tools from ${this.connector.discoveredProviders.length} providers (all idle)`,
        );
        console.error(
          `[proxy] Idle timeout: ${this.config.idleTimeoutMs > 0 ? `${this.config.idleTimeoutMs / 1000}s` : "disabled"}`,
        );
        console.error(
          `[proxy] Semantic search: ${this.embeddings.isReady() ? "enabled" : "disabled (lexical fallback)"}`,
        );
        console.error(
          "[proxy] Exposing 3 tools: mcp_search, mcp_schema, mcp_call",
        );
      })();

      this.upstreamsReady.catch((error) => {
        console.error(
          "[proxy] Background upstream discovery failed:",
          error instanceof Error ? error.message : error,
        );
      });
    } catch (error) {
      console.error(
        "[proxy] Failed to start:",
        error instanceof Error ? error.message : error,
      );
      await this.cleanup();
      process.exit(1);
    }
  }

  async cleanup(): Promise<void> {
    try {
      this.connector.stopIdleReaper();
      this.dashboard.stop();
      await this.connector.disconnectAll();
    } catch (error) {
      console.error(
        "[proxy] Error during cleanup:",
        error instanceof Error ? error.message : error,
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
