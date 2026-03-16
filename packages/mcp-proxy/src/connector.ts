import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UpstreamServerConfig, UpstreamStatus, ProxyError } from "./types.js";
import { ToolRegistry } from "./registry.js";

interface ConnectedUpstream {
  config: UpstreamServerConfig;
  client: Client;
}

const MAX_LOGS = 100;

export class McpConnectorManager {
  private readonly upstreams = new Map<string, ConnectedUpstream>();
  private readonly statuses = new Map<string, UpstreamStatus>();

  constructor(private readonly registry: ToolRegistry) {}

  private addLog(name: string, msg: string): void {
    const s = this.statuses.get(name);
    if (!s) return;
    s.logs.push(`[${new Date().toISOString()}] ${msg}`);
    if (s.logs.length > MAX_LOGS) s.logs = s.logs.slice(-MAX_LOGS);
  }

  getStatuses(): UpstreamStatus[] {
    return Array.from(this.statuses.values());
  }

  async connect(config: UpstreamServerConfig): Promise<void> {
    this.statuses.set(config.name, {
      name: config.name,
      transport: config.transport,
      status: "connecting",
      toolCount: 0,
      logs: [],
    });
    this.addLog(config.name, `Connecting via ${config.transport}...`);

    try {
      if (config.transport === "http") {
        await this.connectHttp(config);
      } else {
        await this.connectStdio(config);
      }

      await this.ingestTools(config.name, this.upstreams.get(config.name)!.client);
      const toolCount = this.registry.getByProvider(config.name).length;
      const s = this.statuses.get(config.name)!;
      s.status = "connected";
      s.toolCount = toolCount;
      this.addLog(config.name, `Connected — ${toolCount} tools`);
      console.error(`[connector] ${config.name} — ${toolCount} tools`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const s = this.statuses.get(config.name)!;
      s.status = "error";
      s.error = msg;
      this.addLog(config.name, `ERROR: ${msg}`);
      if (error instanceof Error && error.stack) {
        this.addLog(config.name, error.stack);
      }
      console.error(`[connector] Failed ${config.name}:`, msg);
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
      stderr: "pipe",
    });
    await client.connect(transport);
    this.pipeStderr(config.name, transport);
    this.upstreams.set(config.name, { config, client });
  }

  private pipeStderr(name: string, transport: StdioClientTransport): void {
    const stream = transport.stderr as unknown as NodeJS.ReadableStream | null;
    if (!stream || typeof stream.on !== "function") return;
    let buf = "";
    stream.on("data", (chunk: Buffer | string) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trimEnd();
        buf = buf.slice(nl + 1);
        if (line) {
          this.addLog(name, line);
          console.error(`[${name}] ${line}`);
        }
      }
    });
    stream.on("end", () => {
      if (buf.trim()) {
        this.addLog(name, buf.trim());
        console.error(`[${name}] ${buf.trim()}`);
      }
    });
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
    let previousCursor: string | undefined;
    do {
      const response = await client.listTools({ cursor });
      for (const tool of response.tools) {
        await this.registry.ingestUpstreamTool(
          provider, tool.name, tool.description || "",
          (tool.inputSchema as Record<string, unknown>) || {}
        );
      }
      if (response.nextCursor && response.nextCursor === cursor) break;
      previousCursor = cursor;
      cursor = response.nextCursor;
      if (cursor && cursor === previousCursor) break;
    } while (cursor);
  }

  get connectedProviders(): string[] {
    return Array.from(this.upstreams.keys());
  }
}
