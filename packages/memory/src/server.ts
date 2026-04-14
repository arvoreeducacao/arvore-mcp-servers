import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MemoryStore } from "./store.js";
import { MemoryMCPTools } from "./tools.js";
import {
  SearchMemoriesParamsSchema,
  GetMemoryParamsSchema,
  AddMemoryParamsSchema,
  ListMemoriesParamsSchema,
  RemoveMemoryParamsSchema,
  ArchiveMemoryParamsSchema,
} from "./types.js";

export class MemoryMCPServer {
  private server: McpServer;
  private store: MemoryStore;
  private tools: MemoryMCPTools;

  constructor(memoriesPath: string, embeddingModel?: string) {
    this.server = new McpServer({
      name: "memory-mcp-server",
      version: "1.0.0",
    });

    this.store = new MemoryStore(memoriesPath, embeddingModel);
    this.tools = new MemoryMCPTools(this.store);

    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool(
      "search_memories",
      {
        title: "Search Team Memories",
        description:
          "Semantic search across team memories — decisions, conventions, incidents, domain knowledge, and gotchas. " +
          "Use this to find relevant context before starting work on a task. " +
          "Examples: 'database migration strategy', 'authentication flow', 'deploy process'.",
        inputSchema: SearchMemoriesParamsSchema.shape,
      },
      async (params) => {
        const validated = SearchMemoriesParamsSchema.parse(params);
        return this.tools.searchMemories(validated);
      }
    );

    this.server.registerTool(
      "get_memory",
      {
        title: "Get Memory Details",
        description:
          "Get the full content of a specific memory by ID. " +
          "Use after search_memories to read the complete context of a relevant memory.",
        inputSchema: GetMemoryParamsSchema.shape,
      },
      async (params) => {
        const validated = GetMemoryParamsSchema.parse(params);
        return this.tools.getMemory(validated);
      }
    );

    this.server.registerTool(
      "add_memory",
      {
        title: "Add Team Memory",
        description:
          "Create a new team memory entry. Use to capture decisions, conventions, incidents, domain knowledge, or gotchas " +
          "discovered during development. Categories: decisions, conventions, incidents, domain, gotchas.",
        inputSchema: AddMemoryParamsSchema.shape,
      },
      async (params) => {
        const validated = AddMemoryParamsSchema.parse(params);
        return this.tools.addMemory(validated);
      }
    );

    this.server.registerTool(
      "list_memories",
      {
        title: "List Team Memories",
        description:
          "List all team memories, optionally filtered by category and status. " +
          "Returns a catalog with titles, categories, dates, and snippets.",
        inputSchema: ListMemoriesParamsSchema.shape,
      },
      async (params) => {
        const validated = ListMemoriesParamsSchema.parse(params);
        return this.tools.listMemories(validated);
      }
    );

    this.server.registerTool(
      "remove_memory",
      {
        title: "Remove Memory",
        description: "Permanently delete a memory entry. Prefer archive_memory for soft removal.",
        inputSchema: RemoveMemoryParamsSchema.shape,
      },
      async (params) => {
        const validated = RemoveMemoryParamsSchema.parse(params);
        return this.tools.removeMemory(validated);
      }
    );

    this.server.registerTool(
      "archive_memory",
      {
        title: "Archive Memory",
        description:
          "Archive a memory so it no longer appears in active searches but is preserved for history.",
        inputSchema: ArchiveMemoryParamsSchema.shape,
      },
      async (params) => {
        const validated = ArchiveMemoryParamsSchema.parse(params);
        return this.tools.archiveMemory(validated);
      }
    );
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Memory MCP Server connected, loading store in background...");

    this.store.load().then(() => {
      console.error("Memory MCP Server store loaded successfully");
    }).catch((error) => {
      console.error(`Failed to load store: ${error instanceof Error ? error.message : error}`);
    });
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", async (error) => {
      console.error("Uncaught exception:", error);
      process.exit(1);
    });
    process.on("unhandledRejection", async (reason) => {
      console.error("Unhandled rejection:", reason);
      process.exit(1);
    });
  }
}
