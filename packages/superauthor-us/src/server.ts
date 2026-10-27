import { createServer, type Server as HttpServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { GoogleSignInConfig, OAuthProvider } from "./oauth-provider.js";
import { ProgramReport } from "./report.js";
import { SuperAuthorUSTools } from "./tools.js";
import { Queryable } from "./database.js";
import { ListSchoolsParamsSchema, SchoolStatusParamsSchema } from "./types.js";

export interface SuperAuthorUSServerOptions {
  db: Queryable;
  host: string;
  port: number;
  opsToken: string;
  signingKey: string;
  publicUrl?: string;
  googleSignIn: GoogleSignInConfig;
  allowedEmails: () => Set<string>;
  allowedRedirectHosts?: string[];
}

export class SuperAuthorUSServer {
  private httpServer: HttpServer | null = null;
  private transports = new Map<string, StreamableHTTPServerTransport>();
  private oauth: OAuthProvider;
  private tools: SuperAuthorUSTools;
  private publicUrl: string;

  constructor(private options: SuperAuthorUSServerOptions) {
    this.publicUrl = (options.publicUrl || `http://${options.host}:${options.port}`).replace(/\/+$/, "");
    this.tools = new SuperAuthorUSTools(new ProgramReport(options.db));
    this.oauth = new OAuthProvider({
      signingSecret: options.signingKey,
      serviceName: "Super Author US programs",
      issuer: () => this.publicUrl,
      googleSignIn: options.googleSignIn,
      isAllowedEmail: (email) => options.allowedEmails().has(email.toLowerCase()),
      allowedRedirectHosts: options.allowedRedirectHosts,
    });
  }

  createMcpServer(caller: string): McpServer {
    const server = new McpServer({ name: "superauthor-us-mcp-server", version: "1.0.0" });

    server.registerTool(
      "list_us_schools",
      {
        title: "List US schools",
        description:
          "List the US schools running the Super Author writing program in a school year, with their network, number of class projects and print-ready deadline range. Use it to find school ids.",
        inputSchema: ListSchoolsParamsSchema.shape,
        annotations: { readOnlyHint: true },
      },
      async (params) => {
        console.error(`[superauthor-us-mcp] ${caller} list_us_schools`);
        return this.tools.listSchools(ListSchoolsParamsSchema.parse(params));
      }
    );

    server.registerTool(
      "get_school_status",
      {
        title: "Get school status",
        description:
          "Live status of the given US schools from the writing platform: implementation start, print-ready deadline and publishing party dates (per school and per class), each teacher with email, whether the educator profile is complete, and every class with student count and whether pages were printed and uploaded. Read only.",
        inputSchema: SchoolStatusParamsSchema.shape,
        annotations: { readOnlyHint: true },
      },
      async (params) => {
        const parsed = SchoolStatusParamsSchema.parse(params);
        console.error(`[superauthor-us-mcp] ${caller} get_school_status ${parsed.schools.length} schools`);
        return this.tools.schoolStatus(parsed);
      }
    );

    return server;
  }

  async start(): Promise<void> {
    const { host, port } = this.options;

    this.httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

        if (url.pathname === "/health") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("ok");
          return;
        }

        if (this.oauth.handles(url.pathname)) {
          await this.oauth.handle(req, res, url);
          return;
        }

        if (url.pathname !== "/mcp") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }

        const bearer = readBearer(req);
        const ops = this.options.opsToken !== "" && matchesToken(bearer, this.options.opsToken);
        const identity = ops || bearer === "" ? null : this.oauth.resolveIdentity(bearer);

        if (!ops && !identity) {
          res.writeHead(401, {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer realm="superauthor-us-mcp", resource_metadata="${this.publicUrl}/.well-known/oauth-protected-resource"`,
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

          await this.createMcpServer(identity?.email ?? "ops-token").connect(created);
          transport = created;
        }

        await transport.handleRequest(req, res, body);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`HTTP handler error: ${message}`);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "internal error" }));
        }
      }
    });

    await new Promise<void>((resolve) => {
      this.httpServer!.listen(port, host, () => resolve());
    });

    console.error(`Super Author US MCP listening on http://${host}:${port}/mcp (public ${this.publicUrl})`);
  }

  setupGracefulShutdown(onClose: () => Promise<void>): void {
    const shutdown = async () => {
      for (const transport of this.transports.values()) {
        await transport.close().catch(() => undefined);
      }
      this.httpServer?.close();
      await onClose().catch(() => undefined);
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}

function readBearer(req: IncomingMessage): string {
  const header = req.headers.authorization || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function matchesToken(candidate: string, expected: string): boolean {
  if (!candidate || candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

const MAX_BODY_BYTES = 256 * 1024;

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
