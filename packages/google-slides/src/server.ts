import { createServer, type Server as HttpServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { OAuthProvider } from "./oauth-provider.js";
import { GoogleSlidesClient } from "./client.js";
import { GoogleSlidesMCPTools } from "./tools.js";
import {
  AddSlideParamsSchema,
  BatchUpdateParamsSchema,
  CopyPresentationParamsSchema,
  CreatePresentationParamsSchema,
  DeleteObjectParamsSchema,
  ExportPresentationParamsSchema,
  GetPageParamsSchema,
  GetPresentationParamsSchema,
  GetSlideImageParamsSchema,
  GoogleSlidesClientConfig,
  InsertImageParamsSchema,
  InsertTextParamsSchema,
  ListPresentationsParamsSchema,
  ReplaceAllTextParamsSchema,
  SetSpeakerNotesParamsSchema,
  SummarizePresentationParamsSchema,
} from "./types.js";

export interface GoogleSlidesMCPServerOptions {
  client: GoogleSlidesClientConfig;
  transport: "stdio" | "http";
  host: string;
  port: number;
  authToken: string;
  publicUrl?: string;
}

export class GoogleSlidesMCPServer {
  private client: GoogleSlidesClient;
  private tools: GoogleSlidesMCPTools;
  private options: GoogleSlidesMCPServerOptions;
  private httpServer: HttpServer | null = null;
  private transports = new Map<string, StreamableHTTPServerTransport>();
  private oauth: OAuthProvider;
  private publicUrl: string;

  constructor(options: GoogleSlidesMCPServerOptions) {
    this.options = options;
    this.publicUrl = (options.publicUrl || `http://${options.host}:${options.port}`).replace(
      /\/+$/,
      ""
    );
    this.oauth = new OAuthProvider({
      sharedSecret: options.authToken,
      issuer: () => this.publicUrl,
    });
    this.client = new GoogleSlidesClient(options.client);
    this.tools = new GoogleSlidesMCPTools(this.client, {
      allowLocalWrites: options.transport === "stdio",
    });
  }

  private createMcpServer(): McpServer {
    const server = new McpServer({
      name: "google-slides-mcp-server",
      version: "1.0.0",
    });

    server.registerTool(
      "list_presentations",
      {
        title: "List Presentations",
        description:
          "List Google Slides presentations from Drive, newest first. Use nameContains to search by title and folderId to scope to a folder.",
        inputSchema: ListPresentationsParamsSchema.shape,
      },
      async (params) => this.tools.listPresentations(ListPresentationsParamsSchema.parse(params))
    );

    server.registerTool(
      "create_presentation",
      {
        title: "Create Presentation",
        description:
          "Create a blank presentation. Returns presentationId, the object id of the first slide and the edit URL. Prefer copy_presentation when a template exists.",
        inputSchema: CreatePresentationParamsSchema.shape,
      },
      async (params) =>
        this.tools.createPresentation(CreatePresentationParamsSchema.parse(params))
    );

    server.registerTool(
      "copy_presentation",
      {
        title: "Copy Presentation",
        description:
          "Copy an existing presentation or template into a new file, optionally inside a folder. Best starting point for branded decks: copy, then replace_all_text on the placeholders.",
        inputSchema: CopyPresentationParamsSchema.shape,
      },
      async (params) => this.tools.copyPresentation(CopyPresentationParamsSchema.parse(params))
    );

    server.registerTool(
      "summarize_presentation",
      {
        title: "Summarize Presentation",
        description:
          "Compact structural view of a deck: every slide with its page object id, text elements with their object ids and placeholder types, plus speaker notes. Start here before editing — object ids from this call are what the edit tools take.",
        inputSchema: SummarizePresentationParamsSchema.shape,
      },
      async (params) =>
        this.tools.summarizePresentation(SummarizePresentationParamsSchema.parse(params))
    );

    server.registerTool(
      "get_presentation",
      {
        title: "Get Presentation (raw)",
        description:
          "Raw Slides API presentation resource. Large — always pass a fields mask (e.g. 'slides.objectId,slides.pageElements(objectId,shape.shapeType)') unless you need everything, including layouts and masters.",
        inputSchema: GetPresentationParamsSchema.shape,
      },
      async (params) => this.tools.getPresentation(GetPresentationParamsSchema.parse(params))
    );

    server.registerTool(
      "get_page",
      {
        title: "Get Page (raw)",
        description:
          "Raw page resource for one slide, addressed by pageObjectId or slideIndex. Includes exact geometry (transform, size) of every element — use it when positioning matters.",
        inputSchema: GetPageParamsSchema.shape,
      },
      async (params) => this.tools.getPage(GetPageParamsSchema.parse(params))
    );

    server.registerTool(
      "get_slide_image",
      {
        title: "Screenshot Slide",
        description:
          "Render a slide as a PNG and return it as an image, so the deck can be inspected visually. Use it after every batch of edits to check layout, overflow and alignment. Sizes: SMALL 200px, MEDIUM 800px, LARGE 1600px.",
        inputSchema: GetSlideImageParamsSchema.shape,
      },
      async (params) => this.tools.getSlideImage(GetSlideImageParamsSchema.parse(params))
    );

    server.registerTool(
      "add_slide",
      {
        title: "Add Slide",
        description:
          "Append or insert a slide from a predefined layout and fill its title/subtitle/body placeholders in one call. Returns the new page object id.",
        inputSchema: AddSlideParamsSchema.shape,
      },
      async (params) => this.tools.addSlide(AddSlideParamsSchema.parse(params))
    );

    server.registerTool(
      "insert_text",
      {
        title: "Insert Text",
        description:
          "Insert text into a shape or table cell by object id. Pass replaceExisting to overwrite the current content instead of appending.",
        inputSchema: InsertTextParamsSchema.shape,
      },
      async (params) => this.tools.insertText(InsertTextParamsSchema.parse(params))
    );

    server.registerTool(
      "replace_all_text",
      {
        title: "Replace All Text",
        description:
          "Find-and-replace across the whole deck (or specific pages). The fastest way to fill a template full of {{placeholders}}.",
        inputSchema: ReplaceAllTextParamsSchema.shape,
      },
      async (params) => this.tools.replaceAllText(ReplaceAllTextParamsSchema.parse(params))
    );

    server.registerTool(
      "insert_image",
      {
        title: "Insert Image",
        description:
          "Place a publicly reachable image on a slide at a position/size given in points (a 16:9 slide is 720x405pt).",
        inputSchema: InsertImageParamsSchema.shape,
      },
      async (params) => this.tools.insertImage(InsertImageParamsSchema.parse(params))
    );

    server.registerTool(
      "set_speaker_notes",
      {
        title: "Set Speaker Notes",
        description:
          "Replace the speaker notes of a slide, addressed by pageObjectId or slideIndex.",
        inputSchema: SetSpeakerNotesParamsSchema.shape,
      },
      async (params) => this.tools.setSpeakerNotes(SetSpeakerNotesParamsSchema.parse(params))
    );

    server.registerTool(
      "delete_object",
      {
        title: "Delete Object",
        description:
          "Delete a page element or an entire slide by object id (a slide's page object id deletes the slide).",
        inputSchema: DeleteObjectParamsSchema.shape,
      },
      async (params) => this.tools.deleteObject(DeleteObjectParamsSchema.parse(params))
    );

    server.registerTool(
      "batch_update_presentation",
      {
        title: "Batch Update (raw Slides API)",
        description:
          "Escape hatch with the full power of the Slides API: send an array of raw Request objects (createShape, createTable, updateTextStyle, updateShapeProperties, updatePageElementTransform, duplicateObject, updateSlidesPosition, createLine, refreshSheetsChart...). Requests run atomically in order. Use the typed tools for common edits and this one for styling, geometry and anything else.",
        inputSchema: BatchUpdateParamsSchema.shape,
      },
      async (params) => this.tools.batchUpdate(BatchUpdateParamsSchema.parse(params))
    );

    server.registerTool(
      "export_presentation",
      {
        title: "Export Presentation",
        description:
          "Export the deck as pdf, pptx or txt. Binary formats only report size unless destinationPath is given (local stdio runs); txt is returned inline.",
        inputSchema: ExportPresentationParamsSchema.shape,
      },
      async (params) =>
        this.tools.exportPresentation(ExportPresentationParamsSchema.parse(params))
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
    console.error("Google Slides MCP Server running on stdio");
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

        const pathToken = readPathToken(url.pathname);
        if (url.pathname !== "/mcp" && pathToken === null) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }

        const bearer = readBearer(req);
        const authorized =
          matchesToken(bearer, authToken) ||
          (pathToken !== null && matchesToken(pathToken, authToken)) ||
          (bearer !== "" && this.oauth.verifyAccessToken(bearer));

        if (!authorized) {
          res.writeHead(401, {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer realm="google-slides-mcp", resource_metadata="${this.publicUrl}/.well-known/oauth-protected-resource"`,
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

          await this.createMcpServer().connect(created);
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
      `Google Slides MCP Server listening on http://${host}:${port}/mcp (public ${this.publicUrl}) — bearer, /mcp/<token>, or OAuth`
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

function readPathToken(pathname: string): string | null {
  const match = /^\/mcp\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
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
