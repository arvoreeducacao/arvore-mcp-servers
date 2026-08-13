import { createServer, type Server as HttpServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { MemoryStore } from "./store.js";
import { MemoryMCPTools } from "./tools.js";
import { GoogleSignInConfig, OAuthProvider, ResolvedIdentity } from "./oauth-provider.js";
import { ReadMemoriesParamsSchema, WriteMemoryParamsSchema } from "./types.js";

const SERVER_VERSION = "2.0.0";

export interface MemoryMCPServerOptions {
  memoriesPath: string;
  embeddingModel?: string;
  transport?: "stdio" | "http";
  host?: string;
  port?: number;
  authToken?: string;
  publicUrl?: string;
  author?: string;
  googleSignIn?: GoogleSignInConfig;
}

export class MemoryMCPServer {
  private readonly options: MemoryMCPServerOptions;
  private readonly transport: "stdio" | "http";
  private readonly store: MemoryStore;
  private readonly oauth: OAuthProvider | null;
  private readonly publicUrl: string;
  private httpServer: HttpServer | null = null;
  private transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(options: MemoryMCPServerOptions | string, embeddingModel?: string) {
    this.options =
      typeof options === "string" ? { memoriesPath: options, embeddingModel } : options;
    this.transport = this.options.transport ?? "stdio";

    const host = this.options.host ?? "0.0.0.0";
    const port = this.options.port ?? 8080;
    this.publicUrl = (this.options.publicUrl || `http://${host}:${port}`).replace(/\/+$/, "");

    this.store = new MemoryStore(this.options.memoriesPath, this.options.embeddingModel);

    this.oauth =
      this.transport === "http"
        ? new OAuthProvider({
            sharedSecret: this.options.authToken || "",
            issuer: () => this.publicUrl,
            googleSignIn: this.options.googleSignIn,
          })
        : null;
  }

  private createMcpServer(author?: string): McpServer {
    const server = new McpServer({
      name: "memory-mcp-server",
      version: SERVER_VERSION,
    });

    const tools = new MemoryMCPTools(this.store, { author });

    server.registerTool(
      "read_memories",
      {
        title: "Read Árvore Memories",
        description:
          "Read the shared memory of Árvore — decisions, conventions, incidents, domain knowledge and gotchas the team has learned. " +
          "Call with no arguments to get the index grouped by category, with query to search by meaning (Portuguese or English), " +
          "or with id to open one memory in full. Use it before starting work to recover context the team already paid for.",
        inputSchema: ReadMemoriesParamsSchema.shape,
      },
      async (params) => {
        const validated = ReadMemoriesParamsSchema.parse(params);
        return tools.readMemories(validated);
      }
    );

    server.registerTool(
      "write_memory",
      {
        title: "Write Árvore Memory",
        description:
          "Record something the team learned into the shared memory of Árvore. " +
          "Send title, category and content to create; send id plus the fields to change to correct an existing memory; " +
          "send action archive to retire one, or action delete to remove it. " +
          "Categories: decisions, conventions, incidents, domain, gotchas. " +
          "Everyone reads what you write here, so record durable facts — not what only matters to the current conversation.",
        inputSchema: WriteMemoryParamsSchema.shape,
      },
      async (params) => {
        const validated = WriteMemoryParamsSchema.parse(params);
        return tools.writeMemory(validated);
      }
    );

    return server;
  }

  async start(): Promise<void> {
    if (this.transport === "http") {
      await this.startHttp();
      return;
    }

    const server = this.createMcpServer(this.options.author);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Memory MCP Server connected, loading store in background...");

    this.loadStore();
  }

  private loadStore(): void {
    this.store
      .load()
      .then(() => console.error("Memory MCP Server store loaded successfully"))
      .catch((error) =>
        console.error(`Failed to load store: ${error instanceof Error ? error.message : error}`)
      );
  }

  private async startHttp(): Promise<void> {
    const oauth = this.oauth;
    const authToken = this.options.authToken || "";

    if (!oauth) {
      throw new Error("http transport requires the OAuth provider");
    }

    this.loadStore();

    this.httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

        if (url.pathname === "/health") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("ok");
          return;
        }

        if (oauth.handles(url.pathname)) {
          await oauth.handle(req, res, url);
          return;
        }

        const pathToken = readPathToken(url.pathname);
        if (url.pathname !== "/mcp" && pathToken === null) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }

        const bearer = readBearer(req);
        const staticAuthorized =
          matchesToken(bearer, authToken) ||
          (pathToken !== null && matchesToken(pathToken, authToken));
        const identity: ResolvedIdentity | null =
          bearer === "" ? null : oauth.resolveIdentity(bearer);
        const authorized =
          staticAuthorized || (bearer !== "" && oauth.verifyAccessToken(bearer));

        if (!authorized) {
          res.writeHead(401, {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer realm="memory-mcp", resource_metadata="${this.publicUrl}/.well-known/oauth-protected-resource"`,
          });
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }

        if (req.method !== "POST" && req.method !== "GET" && req.method !== "DELETE") {
          res.writeHead(405, { "Content-Type": "text/plain" });
          res.end("Method not allowed");
          return;
        }

        const body = req.method === "POST" ? await readJsonBody(req) : undefined;
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        let transport = sessionId ? this.transports.get(sessionId) : undefined;

        if (!transport) {
          if (req.method !== "POST" || !isInitializeRequest(body)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: sessionId
                  ? "unknown session — reinitialize"
                  : "missing mcp-session-id; only an initialize request may open a session",
              })
            );
            return;
          }

          const created = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => {
              this.transports.set(id, created);
            },
          });

          created.onclose = () => {
            if (created.sessionId) this.transports.delete(created.sessionId);
          };

          await this.createMcpServer(identity?.email).connect(created);
          transport = created;
        }

        await transport.handleRequest(req, res, body);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[memory-mcp] http handler error: ${message}\n`);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
      }
    });

    const host = this.options.host ?? "0.0.0.0";
    const port = this.options.port ?? 8080;

    await new Promise<void>((resolve) => {
      this.httpServer!.listen(port, host, () => resolve());
    });

    process.stderr.write(
      `[memory-mcp] listening on http://${host}:${port}/mcp (public ${this.publicUrl})\n`
    );
  }

  setupGracefulShutdown(): void {
    const shutdown = (signal: string): void => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      this.httpServer?.close();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", (error) => {
      console.error("Uncaught exception:", error);
      process.exit(1);
    });
    process.on("unhandledRejection", (reason) => {
      console.error("Unhandled rejection:", reason);
      process.exit(1);
    });
  }
}

function readBearer(req: IncomingMessage): string {
  const header = req.headers.authorization || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function readPathToken(pathname: string): string | null {
  const match = /^\/mcp\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function matchesToken(candidate: string, expected: string): boolean {
  if (!candidate || !expected || candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

const MAX_BODY_BYTES = 4 * 1024 * 1024;

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`);
    }
    chunks.push(buffer);
  }

  if (size === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}
