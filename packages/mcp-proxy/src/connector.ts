import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UpstreamServerConfig, ProxyError } from "./types.js";
import { ToolRegistry } from "./registry.js";

interface ConnectedUpstream {
  config: UpstreamServerConfig;
  client: Client;
}

export class McpConnectorManager {
  private readonly upstreams = new Map<string, ConnectedUpstream>();

  constructor(private readonly registry: ToolRegistry) {}

  async connect(config: UpstreamServerConfig): Promise<void> {
    console.error(`[connector] Connecting to ${config.name} via ${config.transport}...`);

    try {
      if (config.transport === "http") {
        await this.connectHttp(config);
      } else {
        await this.connectStdio(config);
      }

      await this.ingestTools(config.name, this.upstreams.get(config.name)!.client);
      console.error(`[connector] ${config.name} — ${this.registry.getByProvider(config.name).length} tools`);
    } catch (error) {
      console.error(`[connector] Failed ${config.name}:`, error instanceof Error ? error.message : error);
      throw new ProxyError(`Failed to connect: ${config.name}`, "UPSTREAM_CONNECTION_FAILED");
    }
  }

  private async connectStdio(config: UpstreamServerConfig): Promise<void> {
    if (!config.command) throw new ProxyError(`${config.name}: stdio needs "command"`, "INVALID_CONFIG");
    const client = new Client({ name: `mcp-proxy-${config.name}`, version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env } as Record<string, string>,
    });
    await client.connect(transport);
    this.upstreams.set(config.name, { config, client });
  }

  private async connectHttp(config: UpstreamServerConfig): Promise<void> {
    if (!config.url) throw new ProxyError(`${config.name}: http needs "url"`, "INVALID_CONFIG");
    const baseUrl = new URL(config.url);

    const token = config.auth?.apiKey
      ? (process.env[config.auth.apiKey] || config.auth.apiKey)
      : undefined;

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const requestInit = { headers };
    const client = new Client({ name: `mcp-proxy-${config.name}`, version: "1.0.0" });

    try {
      const transport = new StreamableHTTPClientTransport(baseUrl, { requestInit });
      await client.connect(transport);
      this.upstreams.set(config.name, { config, client });
    } catch {
      console.error(`[connector] StreamableHTTP failed for ${config.name}, trying SSE...`);
      const sseClient = new Client({ name: `mcp-proxy-${config.name}`, version: "1.0.0" });
      const sseTransport = new SSEClientTransport(baseUrl, { requestInit });
      await sseClient.connect(sseTransport);
      this.upstreams.set(config.name, { config, client: sseClient });
    }
  }

  async connectAll(configs: UpstreamServerConfig[]): Promise<void> {
    const results = await Promise.allSettled(configs.map((c) => this.connect(c)));
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) console.error(`[connector] ${failures.length}/${configs.length} failed`);
    if (this.upstreams.size === 0) throw new ProxyError("No upstreams connected", "NO_UPSTREAMS");
  }

  async callTool(provider: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const upstream = this.upstreams.get(provider);
    if (!upstream) throw new ProxyError(`Provider not connected: ${provider}`, "PROVIDER_NOT_FOUND");

    const result = await upstream.client.callTool({ name: toolName, arguments: args });

    if (result.content && Array.isArray(result.content)) {
      const textParts = result.content
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { text: string }) => c.text);
      if (textParts.length === 1) {
        try { return JSON.parse(textParts[0]); } catch { return textParts[0]; }
      }
      return textParts.join("\n");
    }
    return result;
  }

  async disconnectAll(): Promise<void> {
    for (const [name, upstream] of this.upstreams) {
      try { await upstream.client.close(); } catch (e) {
        console.error(`[connector] Error disconnecting ${name}:`, e instanceof Error ? e.message : e);
      }
    }
    this.upstreams.clear();
  }

  async refreshTools(): Promise<void> {
    this.registry.clear();
    for (const [name, upstream] of this.upstreams) {
      await this.ingestTools(name, upstream.client);
    }
  }

  private async ingestTools(provider: string, client: Client): Promise<void> {
    let cursor: string | undefined;
    do {
      const response = await client.listTools({ cursor });
      for (const tool of response.tools) {
        await this.registry.ingestUpstreamTool(
          provider, tool.name, tool.description || "",
          (tool.inputSchema as Record<string, unknown>) || {}
        );
      }
      cursor = response.nextCursor;
    } while (cursor);
  }

  get connectedProviders(): string[] {
    return Array.from(this.upstreams.keys());
  }
}
