import { createServer, type Server as HttpServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { GoogleSignInConfig, OAuthProvider, ResolvedIdentity } from "./oauth-provider.js";
import { GoogleSheetsClient } from "./client.js";
import { GoogleSheetsMCPTools } from "./tools.js";
import {
  AddSheetParamsSchema,
  AppendRowsParamsSchema,
  BatchUpdateParamsSchema,
  ClearRangeParamsSchema,
  CopySpreadsheetParamsSchema,
  CreateSpreadsheetParamsSchema,
  DeleteDimensionParamsSchema,
  DeleteSheetParamsSchema,
  DescribeSpreadsheetParamsSchema,
  ExportSpreadsheetParamsSchema,
  FindReplaceParamsSchema,
  FormatCellsParamsSchema,
  GoogleSheetsClientConfig,
  InsertDimensionParamsSchema,
  ListSpreadsheetsParamsSchema,
  ReadRangeParamsSchema,
  RenameSheetParamsSchema,
  SortRangeParamsSchema,
  WriteRangeParamsSchema,
} from "./types.js";

export interface GoogleSheetsMCPServerOptions {
  client: GoogleSheetsClientConfig | null;
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

export class GoogleSheetsMCPServer {
  private serviceTools: GoogleSheetsMCPTools | null = null;
  private toolsByIdentity = new Map<string, GoogleSheetsMCPTools>();
  private options: GoogleSheetsMCPServerOptions;
  private httpServer: HttpServer | null = null;
  private transports = new Map<string, StreamableHTTPServerTransport>();
  private oauth: OAuthProvider;
  private publicUrl: string;

  constructor(options: GoogleSheetsMCPServerOptions) {
    this.options = options;
    this.publicUrl = (options.publicUrl || `http://${options.host}:${options.port}`).replace(
      /\/+$/,
      ""
    );
    this.oauth = new OAuthProvider({
      sharedSecret: options.authToken,
      signingSecret: options.signingKey,
      serviceName: "Google Sheets da Árvore",
      allowedRedirectHosts: options.allowedRedirectHosts,
      issuer: () => this.publicUrl,
      googleSignIn: options.googleSignIn,
    });
    if (options.client) {
      this.serviceTools = new GoogleSheetsMCPTools(new GoogleSheetsClient(options.client), {
        allowLocalWrites: options.transport === "stdio",
      });
    }
  }

  private toolsFor(identity: ResolvedIdentity | null): GoogleSheetsMCPTools {
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

    const tools = new GoogleSheetsMCPTools(
      new GoogleSheetsClient({
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
      name: "google-sheets-mcp-server",
      version: "1.0.0",
    });

    server.registerTool(
      "list_spreadsheets",
      {
        title: "List Spreadsheets",
        description:
          "List Google Sheets spreadsheets from Drive, newest first. Use nameContains to search by title and folderId to scope to a folder.",
        inputSchema: ListSpreadsheetsParamsSchema.shape,
      },
      async (params) => tools.listSpreadsheets(ListSpreadsheetsParamsSchema.parse(params))
    );

    server.registerTool(
      "describe_spreadsheet",
      {
        title: "Describe Spreadsheet",
        description:
          "Start here. Every tab with its title, gid, size and frozen rows, the named ranges, plus a preview of the first rows of each tab — enough to know which ranges to read before reading them.",
        inputSchema: DescribeSpreadsheetParamsSchema.shape,
      },
      async (params) => tools.describeSpreadsheet(DescribeSpreadsheetParamsSchema.parse(params))
    );

    server.registerTool(
      "read_range",
      {
        title: "Read Range",
        description:
          "Read one or more A1 ranges as rows of values. FORMATTED_VALUE returns what a person sees, UNFORMATTED_VALUE the raw numbers and dates, FORMULA the formulas themselves. Trailing empty cells are omitted, so rows can be shorter than the range.",
        inputSchema: ReadRangeParamsSchema.shape,
      },
      async (params) => tools.readRange(ReadRangeParamsSchema.parse(params))
    );

    server.registerTool(
      "create_spreadsheet",
      {
        title: "Create Spreadsheet",
        description:
          "Create a spreadsheet with one or more named tabs, optionally inside a folder. Prefer copy_spreadsheet when a template exists.",
        inputSchema: CreateSpreadsheetParamsSchema.shape,
      },
      async (params) => tools.createSpreadsheet(CreateSpreadsheetParamsSchema.parse(params))
    );

    server.registerTool(
      "copy_spreadsheet",
      {
        title: "Copy Spreadsheet",
        description:
          "Copy a spreadsheet or template into a new file, keeping formulas, formatting and charts.",
        inputSchema: CopySpreadsheetParamsSchema.shape,
      },
      async (params) => tools.copySpreadsheet(CopySpreadsheetParamsSchema.parse(params))
    );

    server.registerTool(
      "write_range",
      {
        title: "Write Range",
        description:
          "Write rows of values starting at an A1 range. USER_ENTERED (the default) parses '=SUM(A1:A9)', dates and numbers the way typing them would; RAW stores the literal text. Overwrites the cells it covers and leaves everything else alone.",
        inputSchema: WriteRangeParamsSchema.shape,
      },
      async (params) => tools.writeRange(WriteRangeParamsSchema.parse(params))
    );

    server.registerTool(
      "append_rows",
      {
        title: "Append Rows",
        description:
          "Append rows after the last row with data in a table — the safe way to add records without computing where the data ends.",
        inputSchema: AppendRowsParamsSchema.shape,
      },
      async (params) => tools.appendRows(AppendRowsParamsSchema.parse(params))
    );

    server.registerTool(
      "clear_range",
      {
        title: "Clear Range",
        description: "Clear the values of an A1 range, keeping formatting and validation.",
        inputSchema: ClearRangeParamsSchema.shape,
      },
      async (params) => tools.clearRange(ClearRangeParamsSchema.parse(params))
    );

    server.registerTool(
      "add_sheet",
      {
        title: "Add Sheet",
        description: "Add a tab to the spreadsheet, optionally at a position and with a given size.",
        inputSchema: AddSheetParamsSchema.shape,
      },
      async (params) => tools.addSheet(AddSheetParamsSchema.parse(params))
    );

    server.registerTool(
      "rename_sheet",
      {
        title: "Rename Sheet",
        description: "Rename a tab. Formulas that reference it by name follow automatically.",
        inputSchema: RenameSheetParamsSchema.shape,
      },
      async (params) => tools.renameSheet(RenameSheetParamsSchema.parse(params))
    );

    server.registerTool(
      "delete_sheet",
      {
        title: "Delete Sheet",
        description:
          "Delete a tab and everything in it. Formulas in other tabs that referenced it break into #REF!.",
        inputSchema: DeleteSheetParamsSchema.shape,
      },
      async (params) => tools.deleteSheet(DeleteSheetParamsSchema.parse(params))
    );

    server.registerTool(
      "insert_dimension",
      {
        title: "Insert Rows or Columns",
        description:
          "Insert rows or columns at a zero-based position, shifting everything after it down or right.",
        inputSchema: InsertDimensionParamsSchema.shape,
      },
      async (params) => tools.insertDimension(InsertDimensionParamsSchema.parse(params))
    );

    server.registerTool(
      "delete_dimension",
      {
        title: "Delete Rows or Columns",
        description:
          "Delete rows or columns from a zero-based position — row 1 on screen is startIndex 0.",
        inputSchema: DeleteDimensionParamsSchema.shape,
      },
      async (params) => tools.deleteDimension(DeleteDimensionParamsSchema.parse(params))
    );

    server.registerTool(
      "sort_range",
      {
        title: "Sort Range",
        description:
          "Sort a range by one or more columns. Leave the header row out of the range or it gets sorted with the data.",
        inputSchema: SortRangeParamsSchema.shape,
      },
      async (params) => tools.sortRange(SortRangeParamsSchema.parse(params))
    );

    server.registerTool(
      "format_cells",
      {
        title: "Format Cells",
        description:
          "Format an A1 range: bold, italic, size, font, text and fill colors, alignment, wrapping and number format (currency, percent, date patterns).",
        inputSchema: FormatCellsParamsSchema.shape,
      },
      async (params) => tools.formatCells(FormatCellsParamsSchema.parse(params))
    );

    server.registerTool(
      "find_replace",
      {
        title: "Find and Replace",
        description:
          "Find and replace across one tab or the whole spreadsheet, optionally by regex, whole cell, or inside formulas.",
        inputSchema: FindReplaceParamsSchema.shape,
      },
      async (params) => tools.findReplace(FindReplaceParamsSchema.parse(params))
    );

    server.registerTool(
      "batch_update_spreadsheet",
      {
        title: "Batch Update (raw Sheets API)",
        description:
          "Escape hatch with the full power of the Sheets API: an array of raw Request objects (addChart, mergeCells, updateBorders, setDataValidation, addConditionalFormatRule, addFilterView, autoResizeDimensions, addProtectedRange, updateSpreadsheetProperties...). Requests run atomically in order. GridRange indexes are zero-based and end-exclusive.",
        inputSchema: BatchUpdateParamsSchema.shape,
      },
      async (params) => tools.batchUpdate(BatchUpdateParamsSchema.parse(params))
    );

    server.registerTool(
      "export_spreadsheet",
      {
        title: "Export Spreadsheet",
        description:
          "Export as pdf, xlsx or csv. csv renders one tab and is returned inline; binary formats only report size unless destinationPath is given (local stdio runs).",
        inputSchema: ExportSpreadsheetParamsSchema.shape,
      },
      async (params) => tools.exportSpreadsheet(ExportSpreadsheetParamsSchema.parse(params))
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
    console.error("Google Sheets MCP Server running on stdio");
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
            "WWW-Authenticate": `Bearer realm="google-sheets-mcp", resource_metadata="${this.publicUrl}/.well-known/oauth-protected-resource"`,
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
      `Google Sheets MCP Server listening on http://${host}:${port}/mcp (public ${this.publicUrl}) — bearer or OAuth`
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
