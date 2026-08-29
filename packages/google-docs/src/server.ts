import { createServer, type Server as HttpServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { GoogleSignInConfig, OAuthProvider, ResolvedIdentity } from "./oauth-provider.js";
import { GoogleDocsClient } from "./client.js";
import { GoogleDocsMCPTools } from "./tools.js";
import {
  AppendParagraphsParamsSchema,
  BatchUpdateParamsSchema,
  CopyDocumentParamsSchema,
  CreateDocumentFromMarkdownParamsSchema,
  CreateDocumentParamsSchema,
  DeleteRangeParamsSchema,
  ExportDocumentParamsSchema,
  FormatParagraphParamsSchema,
  FormatTextParamsSchema,
  GetDocumentParamsSchema,
  GoogleDocsClientConfig,
  InsertImageParamsSchema,
  InsertPageBreakParamsSchema,
  InsertTableParamsSchema,
  InsertTextParamsSchema,
  ListDocumentsParamsSchema,
  OutlineDocumentParamsSchema,
  OverwriteDocumentFromMarkdownParamsSchema,
  ReadDocumentParamsSchema,
  ReplaceAllTextParamsSchema,
} from "./types.js";

export interface GoogleDocsMCPServerOptions {
  client: GoogleDocsClientConfig | null;
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

export class GoogleDocsMCPServer {
  private serviceTools: GoogleDocsMCPTools | null = null;
  private toolsByIdentity = new Map<string, GoogleDocsMCPTools>();
  private options: GoogleDocsMCPServerOptions;
  private httpServer: HttpServer | null = null;
  private transports = new Map<string, StreamableHTTPServerTransport>();
  private oauth: OAuthProvider;
  private publicUrl: string;

  constructor(options: GoogleDocsMCPServerOptions) {
    this.options = options;
    this.publicUrl = (options.publicUrl || `http://${options.host}:${options.port}`).replace(
      /\/+$/,
      ""
    );
    this.oauth = new OAuthProvider({
      sharedSecret: options.authToken,
      signingSecret: options.signingKey,
      serviceName: "Google Docs da Árvore",
      allowedRedirectHosts: options.allowedRedirectHosts,
      issuer: () => this.publicUrl,
      googleSignIn: options.googleSignIn,
    });
    if (options.client) {
      this.serviceTools = new GoogleDocsMCPTools(new GoogleDocsClient(options.client), {
        allowLocalWrites: options.transport === "stdio",
      });
    }
  }

  private toolsFor(identity: ResolvedIdentity | null): GoogleDocsMCPTools {
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

    const tools = new GoogleDocsMCPTools(
      new GoogleDocsClient({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        refreshToken: identity.refreshToken,
      }),
      { allowLocalWrites: false }
    );
    this.toolsByIdentity.set(identity.refreshToken, tools);
    return tools;
  }

  private createMcpServer(identity: ResolvedIdentity | null = null): McpServer {
    const tools = this.toolsFor(identity);
    const server = new McpServer({
      name: "google-docs-mcp-server",
      version: "1.0.0",
    });

    server.registerTool(
      "list_documents",
      {
        title: "List Documents",
        description:
          "List Google Docs documents from Drive, newest first. Use nameContains to search by title and folderId to scope to a folder.",
        inputSchema: ListDocumentsParamsSchema.shape,
      },
      async (params) => tools.listDocuments(ListDocumentsParamsSchema.parse(params))
    );

    server.registerTool(
      "read_document",
      {
        title: "Read Document",
        description:
          "Read a document as Markdown — headings, bold, lists, tables and links survive. Start here to understand a document; use outline_document when you need the indexes to edit it.",
        inputSchema: ReadDocumentParamsSchema.shape,
      },
      async (params) => tools.readDocument(ReadDocumentParamsSchema.parse(params))
    );

    server.registerTool(
      "outline_document",
      {
        title: "Outline Document",
        description:
          "Indexed map of the document: every paragraph and table with its startIndex/endIndex, named style and text. The Docs API edits by character index, and these are the indexes the edit tools take. Indexes shift after every edit — re-read this between edits, or order one batch from the highest index down.",
        inputSchema: OutlineDocumentParamsSchema.shape,
      },
      async (params) => tools.outlineDocument(OutlineDocumentParamsSchema.parse(params))
    );

    server.registerTool(
      "create_document",
      {
        title: "Create Document",
        description:
          "Create a blank document, optionally inside a folder. Prefer create_document_from_markdown when the content is already known, and copy_document when a template exists.",
        inputSchema: CreateDocumentParamsSchema.shape,
      },
      async (params) => tools.createDocument(CreateDocumentParamsSchema.parse(params))
    );

    server.registerTool(
      "create_document_from_markdown",
      {
        title: "Create Document from Markdown",
        description:
          "Create a fully formatted document from Markdown in one call — Google converts headings, bold, italic, lists, tables, links and code blocks on import. The fastest way to write a document from scratch; no index math.",
        inputSchema: CreateDocumentFromMarkdownParamsSchema.shape,
      },
      async (params) =>
        tools.createDocumentFromMarkdown(CreateDocumentFromMarkdownParamsSchema.parse(params))
    );

    server.registerTool(
      "overwrite_document_from_markdown",
      {
        title: "Overwrite Document from Markdown",
        description:
          "Replace the ENTIRE content of an existing document with Markdown, keeping the same file id, URL and sharing. Destructive: the old content survives only in File > Version history, and comments anchored to replaced text are orphaned. For a partial edit use replace_all_text or the indexed tools.",
        inputSchema: OverwriteDocumentFromMarkdownParamsSchema.shape,
      },
      async (params) =>
        tools.overwriteDocumentFromMarkdown(
          OverwriteDocumentFromMarkdownParamsSchema.parse(params)
        )
    );

    server.registerTool(
      "copy_document",
      {
        title: "Copy Document",
        description:
          "Copy a document or template into a new file, optionally inside a folder. Best starting point for branded documents: copy, then replace_all_text on the placeholders.",
        inputSchema: CopyDocumentParamsSchema.shape,
      },
      async (params) => tools.copyDocument(CopyDocumentParamsSchema.parse(params))
    );

    server.registerTool(
      "replace_all_text",
      {
        title: "Replace All Text",
        description:
          "Find-and-replace across the whole document, including headers, footers and tables. The fastest way to fill a template full of {{placeholders}}, and the only edit that needs no index.",
        inputSchema: ReplaceAllTextParamsSchema.shape,
      },
      async (params) => tools.replaceAllText(ReplaceAllTextParamsSchema.parse(params))
    );

    server.registerTool(
      "append_paragraphs",
      {
        title: "Append Paragraphs",
        description:
          "Append paragraphs to the end of the document, each with its own named style (TITLE, HEADING_1..6, NORMAL_TEXT) and optional bullets. Handles the index math for you.",
        inputSchema: AppendParagraphsParamsSchema.shape,
      },
      async (params) => tools.appendParagraphs(AppendParagraphsParamsSchema.parse(params))
    );

    server.registerTool(
      "insert_text",
      {
        title: "Insert Text",
        description:
          "Insert raw text at a body index from outline_document. Omit index to append to the end of the document.",
        inputSchema: InsertTextParamsSchema.shape,
      },
      async (params) => tools.insertText(InsertTextParamsSchema.parse(params))
    );

    server.registerTool(
      "delete_range",
      {
        title: "Delete Range",
        description:
          "Delete the content between two indexes from outline_document. Deleting shifts every index after it — re-read the outline before the next edit.",
        inputSchema: DeleteRangeParamsSchema.shape,
      },
      async (params) => tools.deleteRange(DeleteRangeParamsSchema.parse(params))
    );

    server.registerTool(
      "format_text",
      {
        title: "Format Text",
        description:
          "Style a range of characters: bold, italic, underline, strikethrough, size, font, colors and links. Indexes come from outline_document.",
        inputSchema: FormatTextParamsSchema.shape,
      },
      async (params) => tools.formatText(FormatTextParamsSchema.parse(params))
    );

    server.registerTool(
      "format_paragraph",
      {
        title: "Format Paragraph",
        description:
          "Style whole paragraphs in a range: named style (headings), alignment, indentation, spacing, and bullets on or off.",
        inputSchema: FormatParagraphParamsSchema.shape,
      },
      async (params) => tools.formatParagraph(FormatParagraphParamsSchema.parse(params))
    );

    server.registerTool(
      "insert_table",
      {
        title: "Insert Table",
        description:
          "Insert a table and optionally fill its cells row by row. Omit index to append to the end.",
        inputSchema: InsertTableParamsSchema.shape,
      },
      async (params) => tools.insertTable(InsertTableParamsSchema.parse(params))
    );

    server.registerTool(
      "insert_image",
      {
        title: "Insert Image",
        description:
          "Insert a publicly reachable image inline at an index, optionally at a size in points (a Letter page is 612x792pt with 72pt margins).",
        inputSchema: InsertImageParamsSchema.shape,
      },
      async (params) => tools.insertImage(InsertImageParamsSchema.parse(params))
    );

    server.registerTool(
      "insert_page_break",
      {
        title: "Insert Page Break",
        description: "Insert a page break at an index, or at the end of the document.",
        inputSchema: InsertPageBreakParamsSchema.shape,
      },
      async (params) => tools.insertPageBreak(InsertPageBreakParamsSchema.parse(params))
    );

    server.registerTool(
      "get_document",
      {
        title: "Get Document (raw)",
        description:
          "Raw Docs API document resource. Large — pass a fields mask unless you need everything, including headers, footers, lists and inline objects. Prefer outline_document for editing and read_document for reading.",
        inputSchema: GetDocumentParamsSchema.shape,
      },
      async (params) => tools.getDocument(GetDocumentParamsSchema.parse(params))
    );

    server.registerTool(
      "batch_update_document",
      {
        title: "Batch Update (raw Docs API)",
        description:
          "Escape hatch with the full power of the Docs API: an array of raw Request objects (insertText, deleteContentRange, updateTextStyle, updateParagraphStyle, insertTable, insertTableRow, mergeTableCells, createHeader, createFooter, updateDocumentStyle, createNamedRange...). Requests run atomically in order, and each one sees the indexes left by the previous — order edits from the highest index to the lowest.",
        inputSchema: BatchUpdateParamsSchema.shape,
      },
      async (params) => tools.batchUpdate(BatchUpdateParamsSchema.parse(params))
    );

    server.registerTool(
      "export_document",
      {
        title: "Export Document",
        description:
          "Export the document as pdf, docx, txt, md, html, odt, rtf or epub. Text formats are returned inline; binary formats only report size unless destinationPath is given (local stdio runs).",
        inputSchema: ExportDocumentParamsSchema.shape,
      },
      async (params) => tools.exportDocument(ExportDocumentParamsSchema.parse(params))
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
    console.error("Google Docs MCP Server running on stdio");
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
            "WWW-Authenticate": `Bearer realm="google-docs-mcp", resource_metadata="${this.publicUrl}/.well-known/oauth-protected-resource"`,
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
      `Google Docs MCP Server listening on http://${host}:${port}/mcp (public ${this.publicUrl}) — bearer or OAuth`
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
