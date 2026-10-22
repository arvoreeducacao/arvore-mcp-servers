import { createServer, type Server as HttpServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { GoogleSignInConfig, OAuthProvider, ResolvedIdentity } from "./oauth-provider.js";
import { GoogleTasksClient } from "./client.js";
import { GoogleTasksMCPTools } from "./tools.js";
import {
  ClearCompletedParamsSchema,
  CreateTaskListParamsSchema,
  CreateTaskParamsSchema,
  DeleteTaskListParamsSchema,
  DeleteTaskParamsSchema,
  GetTaskParamsSchema,
  GoogleTasksClientConfig,
  ListTaskListsParamsSchema,
  ListTasksParamsSchema,
  MoveTaskParamsSchema,
  RenameTaskListParamsSchema,
  SetTaskCompletedParamsSchema,
  UpdateTaskParamsSchema,
} from "./types.js";

export interface GoogleTasksMCPServerOptions {
  client: GoogleTasksClientConfig | null;
  transport: "stdio" | "http";
  host: string;
  port: number;
  authToken: string;
  signingKey: string;
  allowedRedirectHosts?: string[];
  publicUrl?: string;
  googleSignIn?: GoogleSignInConfig;
  signInCredentials?: { clientId: string; clientSecret: string };
}

export class GoogleTasksMCPServer {
  private serviceTools: GoogleTasksMCPTools | null = null;
  private toolsByIdentity = new Map<string, GoogleTasksMCPTools>();
  private options: GoogleTasksMCPServerOptions;
  private httpServer: HttpServer | null = null;
  private transports = new Map<string, StreamableHTTPServerTransport>();
  private oauth: OAuthProvider;
  private publicUrl: string;

  constructor(options: GoogleTasksMCPServerOptions) {
    this.options = options;
    this.publicUrl = (options.publicUrl || `http://${options.host}:${options.port}`).replace(
      /\/+$/,
      ""
    );
    this.oauth = new OAuthProvider({
      sharedSecret: options.authToken,
      signingSecret: options.signingKey,
      serviceName: "Google Tasks da Árvore",
      allowedRedirectHosts: options.allowedRedirectHosts,
      issuer: () => this.publicUrl,
      googleSignIn: options.googleSignIn,
    });
    if (options.client) {
      this.serviceTools = new GoogleTasksMCPTools(new GoogleTasksClient(options.client));
    }
  }

  private toolsFor(identity: ResolvedIdentity | null): GoogleTasksMCPTools {
    if (!identity) {
      if (!this.serviceTools) {
        throw new Error(
          "This server has no service identity — connect through OAuth so it acts as your own Google account."
        );
      }
      return this.serviceTools;
    }

    const cached = this.toolsByIdentity.get(identity.refreshToken);
    if (cached) return cached;

    const credentials = this.options.signInCredentials;
    if (!credentials) {
      throw new Error("Google sign-in is not configured on this server.");
    }

    const tools = new GoogleTasksMCPTools(
      new GoogleTasksClient({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        refreshToken: identity.refreshToken,
      })
    );
    this.toolsByIdentity.set(identity.refreshToken, tools);
    return tools;
  }

  private createMcpServer(identity: ResolvedIdentity | null = null): McpServer {
    const tools = this.toolsFor(identity);
    const server = new McpServer({
      name: "google-tasks-mcp-server",
      version: "1.0.0",
    });

    server.registerTool(
      "list_task_lists",
      {
        title: "List Task Lists",
        description:
          'List the Google Tasks lists of the account. Most people keep everything in the default list ("My Tasks"), which every task tool also accepts as "@default".',
        inputSchema: ListTaskListsParamsSchema.shape,
        annotations: { readOnlyHint: true },
      },
      async (params) => tools.listTaskLists(ListTaskListsParamsSchema.parse(params))
    );

    server.registerTool(
      "create_task_list",
      {
        title: "Create Task List",
        description: "Create a new task list.",
        inputSchema: CreateTaskListParamsSchema.shape,
      },
      async (params) => tools.createTaskList(CreateTaskListParamsSchema.parse(params))
    );

    server.registerTool(
      "rename_task_list",
      {
        title: "Rename Task List",
        description: "Rename a task list.",
        inputSchema: RenameTaskListParamsSchema.shape,
        annotations: { idempotentHint: true },
      },
      async (params) => tools.renameTaskList(RenameTaskListParamsSchema.parse(params))
    );

    server.registerTool(
      "delete_task_list",
      {
        title: "Delete Task List",
        description:
          "Delete a task list AND every task in it. Irreversible — confirm with the user first. The default list cannot be deleted.",
        inputSchema: DeleteTaskListParamsSchema.shape,
        annotations: { destructiveHint: true },
      },
      async (params) => tools.deleteTaskList(DeleteTaskListParamsSchema.parse(params))
    );

    server.registerTool(
      "list_tasks",
      {
        title: "List Tasks",
        description:
          "List the tasks of a list, open ones only by default. Filter by due date (dueMin/dueMax), by completion date (completedMin) or by last change (updatedMin). Subtasks come flat with their parentTaskId.",
        inputSchema: ListTasksParamsSchema.shape,
        annotations: { readOnlyHint: true },
      },
      async (params) => tools.listTasks(ListTasksParamsSchema.parse(params))
    );

    server.registerTool(
      "get_task",
      {
        title: "Get Task",
        description: "Read one task with its notes, due date, status and links.",
        inputSchema: GetTaskParamsSchema.shape,
        annotations: { readOnlyHint: true },
      },
      async (params) => tools.getTask(GetTaskParamsSchema.parse(params))
    );

    server.registerTool(
      "create_task",
      {
        title: "Create Task",
        description:
          "Create a task, optionally with notes, a due date (date only — Google Tasks has no time of day) and as a subtask of another. It shows up in Google Tasks and in the Tasks panel of Google Calendar.",
        inputSchema: CreateTaskParamsSchema.shape,
      },
      async (params) => tools.createTask(CreateTaskParamsSchema.parse(params))
    );

    server.registerTool(
      "update_task",
      {
        title: "Update Task",
        description:
          "Change a task's title, notes, due date (null removes it) or status. Only the fields passed change.",
        inputSchema: UpdateTaskParamsSchema.shape,
        annotations: { idempotentHint: true },
      },
      async (params) => tools.updateTask(UpdateTaskParamsSchema.parse(params))
    );

    server.registerTool(
      "complete_task",
      {
        title: "Complete Task",
        description: "Mark a task as done, or reopen it with completed=false.",
        inputSchema: SetTaskCompletedParamsSchema.shape,
        annotations: { idempotentHint: true },
      },
      async (params) => tools.setTaskCompleted(SetTaskCompletedParamsSchema.parse(params))
    );

    server.registerTool(
      "delete_task",
      {
        title: "Delete Task",
        description:
          "Delete a task. Prefer complete_task when the task was simply done — deleting removes it from the history.",
        inputSchema: DeleteTaskParamsSchema.shape,
        annotations: { destructiveHint: true },
      },
      async (params) => tools.deleteTask(DeleteTaskParamsSchema.parse(params))
    );

    server.registerTool(
      "move_task",
      {
        title: "Move Task",
        description:
          "Reorder a task, turn it into a subtask (parentTaskId), bring it back to the top level, or move it to another list (destinationTaskListId).",
        inputSchema: MoveTaskParamsSchema.shape,
      },
      async (params) => tools.moveTask(MoveTaskParamsSchema.parse(params))
    );

    server.registerTool(
      "clear_completed_tasks",
      {
        title: "Clear Completed Tasks",
        description:
          "Hide every completed task of a list from the Google Tasks apps. They stay readable with list_tasks showCompleted=true.",
        inputSchema: ClearCompletedParamsSchema.shape,
      },
      async (params) => tools.clearCompleted(ClearCompletedParamsSchema.parse(params))
    );

    return server;
  }

  async start(): Promise<void> {
    if (this.options.transport === "http") {
      await this.startHttp();
      return;
    }

    const server = this.createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Google Tasks MCP Server running on stdio");
  }

  private async startHttp(): Promise<void> {
    const { host, port, authToken } = this.options;

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
        const staticAuthorized = matchesToken(bearer, authToken);
        const identity =
          staticAuthorized || bearer === "" ? null : this.oauth.resolveIdentity(bearer);
        const authorized =
          staticAuthorized || (bearer !== "" && this.oauth.verifyAccessToken(bearer));

        if (!authorized) {
          res.writeHead(401, {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer realm="google-tasks-mcp", resource_metadata="${this.publicUrl}/.well-known/oauth-protected-resource"`,
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

          await this.createMcpServer(identity).connect(created);
          transport = created;
        }

        await transport.handleRequest(req, res, body);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`HTTP handler error: ${message}`);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
      }
    });

    await new Promise<void>((resolve) => {
      this.httpServer!.listen(port, host, () => resolve());
    });

    console.error(
      `Google Tasks MCP Server listening on http://${host}:${port}/mcp (public ${this.publicUrl}) — bearer or OAuth`
    );
  }

  setupGracefulShutdown(): void {
    const shutdown = async () => {
      for (const transport of this.transports.values()) {
        await transport.close().catch(() => undefined);
      }
      this.httpServer?.close();
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

const MAX_BODY_BYTES = 8 * 1024 * 1024;

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
