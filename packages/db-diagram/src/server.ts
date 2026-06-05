import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseDDL, extractInlineForeignKeys } from "./parser.js";
import { generateErd, generateDomainMap, explainTable, traceFlow } from "./mermaid.js";
import { visualize } from "./visualizer.js";
import {
  GenerateErdParamsSchema,
  GenerateDomainMapParamsSchema,
  ExplainTableParamsSchema,
  TraceFlowParamsSchema,
  VisualizeParamsSchema,
  McpToolResult,
  GenerateErdParams,
  GenerateDomainMapParams,
  ExplainTableParams,
  TraceFlowParams,
  VisualizeParams,
} from "./types.js";

export class DbDiagramMCPServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "db-diagram-mcp-server",
      version: "1.0.0",
    });
    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool(
      "generate_erd",
      {
        title: "Generate ERD",
        description:
          "Generate a Mermaid ER diagram from SQL DDL. Optionally filter to specific tables.",
        inputSchema: {
          ddl: GenerateErdParamsSchema.shape.ddl,
          tables: GenerateErdParamsSchema.shape.tables,
          title: GenerateErdParamsSchema.shape.title,
        },
      },
      async (params): Promise<McpToolResult> => {
        const { ddl, tables, title } = params as GenerateErdParams;
        let schema = parseDDL(ddl);
        schema = extractInlineForeignKeys(ddl, schema);
        const diagram = generateErd(schema, { tables, title });
        return { content: [{ type: "text", text: diagram }] };
      }
    );

    this.server.registerTool(
      "generate_domain_map",
      {
        title: "Generate Domain Map",
        description:
          "Generate a Mermaid diagram showing all tables related to an entry table within N hops.",
        inputSchema: {
          ddl: GenerateDomainMapParamsSchema.shape.ddl,
          entryTable: GenerateDomainMapParamsSchema.shape.entryTable,
          depth: GenerateDomainMapParamsSchema.shape.depth,
        },
      },
      async (params): Promise<McpToolResult> => {
        const { ddl, entryTable, depth } = params as GenerateDomainMapParams;
        let schema = parseDDL(ddl);
        schema = extractInlineForeignKeys(ddl, schema);
        const diagram = generateDomainMap(schema, entryTable, depth ?? 3);
        return { content: [{ type: "text", text: diagram }] };
      }
    );

    this.server.registerTool(
      "explain_table",
      {
        title: "Explain Table",
        description:
          "Show a table's columns, relationships (incoming and outgoing), and a mini ER diagram of its neighborhood.",
        inputSchema: {
          ddl: ExplainTableParamsSchema.shape.ddl,
          table: ExplainTableParamsSchema.shape.table,
        },
      },
      async (params): Promise<McpToolResult> => {
        const { ddl, table } = params as ExplainTableParams;
        let schema = parseDDL(ddl);
        schema = extractInlineForeignKeys(ddl, schema);
        const explanation = explainTable(schema, table);
        return { content: [{ type: "text", text: explanation }] };
      }
    );

    this.server.registerTool(
      "trace_flow",
      {
        title: "Trace Flow",
        description:
          "Find relationship paths between two tables and generate a Mermaid diagram of the connecting tables.",
        inputSchema: {
          ddl: TraceFlowParamsSchema.shape.ddl,
          from: TraceFlowParamsSchema.shape.from,
          to: TraceFlowParamsSchema.shape.to,
        },
      },
      async (params): Promise<McpToolResult> => {
        const { ddl, from, to } = params as TraceFlowParams;
        let schema = parseDDL(ddl);
        schema = extractInlineForeignKeys(ddl, schema);
        const flow = traceFlow(schema, from, to);
        return { content: [{ type: "text", text: flow }] };
      }
    );

    this.server.registerTool(
      "visualize",
      {
        title: "Visualize Diagram",
        description:
          "Render a Mermaid ER diagram in the browser. Accepts DDL (generates ERD) or raw Mermaid code.",
        inputSchema: {
          ddl: VisualizeParamsSchema.shape.ddl,
          mermaid: VisualizeParamsSchema.shape.mermaid,
          tables: VisualizeParamsSchema.shape.tables,
          title: VisualizeParamsSchema.shape.title,
        },
      },
      async (params): Promise<McpToolResult> => {
        const { ddl, mermaid: rawMermaid, tables, title } = params as VisualizeParams;

        let mermaidCode: string;
        if (rawMermaid) {
          mermaidCode = rawMermaid;
        } else if (ddl) {
          let schema = parseDDL(ddl);
          schema = extractInlineForeignKeys(ddl, schema);
          mermaidCode = generateErd(schema, { tables, title });
        } else {
          return { content: [{ type: "text", text: "Provide either 'ddl' or 'mermaid' parameter." }] };
        }

        const url = await visualize(mermaidCode);
        return { content: [{ type: "text", text: `Diagram opened at ${url} (auto-closes in 5 minutes)` }] };
      }
    );
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("DB Diagram MCP Server started successfully");
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }
}
