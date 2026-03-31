import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { KanbanStore } from "./store.js";
import { KanbanMCPTools } from "./tools.js";
import {
  ListBoardsParamsSchema,
  CreateBoardParamsSchema,
  GetBoardParamsSchema,
  GetCardParamsSchema,
  CreateCardParamsSchema,
  UpdateCardParamsSchema,
  MoveCardParamsSchema,
  ClaimCardParamsSchema,
  ReleaseCardParamsSchema,
  SearchCardsParamsSchema,
  ArchiveCardParamsSchema,
  DeleteCardParamsSchema,
  SyncFromAgentTeamsParamsSchema,
} from "./types.js";

export class KanbanMCPServer {
  private server: McpServer;
  private store: KanbanStore;
  private tools: KanbanMCPTools;

  constructor(dataPath: string, embeddingModel?: string, defaultReleaseStatus?: string) {
    this.server = new McpServer({
      name: "kanban-mcp-server",
      version: "1.0.0",
    });
    this.store = new KanbanStore(dataPath, embeddingModel, defaultReleaseStatus);
    this.tools = new KanbanMCPTools(this.store);
    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool(
      "list_boards",
      {
        title: "List Kanban Boards",
        description: "List all kanban boards with summary of columns, cards, and active sessions.",
        inputSchema: ListBoardsParamsSchema.shape,
      },
      async (params) => {
        const validated = ListBoardsParamsSchema.parse(params);
        return this.tools.listBoards(validated);
      }
    );

    this.server.registerTool(
      "create_board",
      {
        title: "Create Kanban Board",
        description: "Create a new kanban board. Default columns: Backlog, Todo, In Progress, Done.",
        inputSchema: CreateBoardParamsSchema.shape,
      },
      async (params) => {
        const validated = CreateBoardParamsSchema.parse(params);
        return this.tools.createBoard(validated);
      }
    );

    this.server.registerTool(
      "get_board",
      {
        title: "Get Kanban Board",
        description: "Get a board with all columns and cards, including active session info. Use to see the full board state.",
        inputSchema: GetBoardParamsSchema.shape,
      },
      async (params) => {
        const validated = GetBoardParamsSchema.parse(params);
        return this.tools.getBoard(validated);
      }
    );

    this.server.registerTool(
      "get_card",
      {
        title: "Get Card Details",
        description: "Get full details of a card including subtasks, session log, and column info.",
        inputSchema: GetCardParamsSchema.shape,
      },
      async (params) => {
        const validated = GetCardParamsSchema.parse(params);
        return this.tools.getCard(validated);
      }
    );

    this.server.registerTool(
      "create_card",
      {
        title: "Create Card",
        description: "Create a new card in a board column. Supports subtasks via parent_card_id.",
        inputSchema: CreateCardParamsSchema.shape,
      },
      async (params) => {
        const validated = CreateCardParamsSchema.parse(params);
        return this.tools.createCard(validated);
      }
    );

    this.server.registerTool(
      "update_card",
      {
        title: "Update Card",
        description: "Update card properties: title, description, priority, assignee, tags. Pass session_id to log who made the change.",
        inputSchema: UpdateCardParamsSchema.shape,
      },
      async (params) => {
        const validated = UpdateCardParamsSchema.parse(params);
        return this.tools.updateCard(validated);
      }
    );

    this.server.registerTool(
      "move_card",
      {
        title: "Move Card",
        description: "Move a card to another column. Specify position (top/bottom) within the target column.",
        inputSchema: MoveCardParamsSchema.shape,
      },
      async (params) => {
        const validated = MoveCardParamsSchema.parse(params);
        return this.tools.moveCard(validated);
      }
    );

    this.server.registerTool(
      "claim_card",
      {
        title: "Claim Card",
        description: "Claim a card for your session. Other sessions will see it as actively being worked on. Use force=true to override another session's claim.",
        inputSchema: ClaimCardParamsSchema.shape,
      },
      async (params) => {
        const validated = ClaimCardParamsSchema.parse(params);
        return this.tools.claimCard(validated);
      }
    );

    this.server.registerTool(
      "release_card",
      {
        title: "Release Card",
        description: "Release a card from your session. Set status to review, completed, paused, failed, or abandoned.",
        inputSchema: ReleaseCardParamsSchema.shape,
      },
      async (params) => {
        const validated = ReleaseCardParamsSchema.parse(params);
        return this.tools.releaseCard(validated);
      }
    );

    this.server.registerTool(
      "search_cards",
      {
        title: "Search Cards",
        description: "Semantic search across all cards. Find cards by meaning, not just keywords. Example: 'authentication issues' finds cards about login, OAuth, etc.",
        inputSchema: SearchCardsParamsSchema.shape,
      },
      async (params) => {
        const validated = SearchCardsParamsSchema.parse(params);
        return this.tools.searchCards(validated);
      }
    );

    this.server.registerTool(
      "archive_card",
      {
        title: "Archive Card",
        description: "Archive a card (soft-delete). Archived cards are hidden from board view by default.",
        inputSchema: ArchiveCardParamsSchema.shape,
      },
      async (params) => {
        const validated = ArchiveCardParamsSchema.parse(params);
        return this.tools.archiveCard(validated);
      }
    );

    this.server.registerTool(
      "delete_card",
      {
        title: "Delete Card",
        description: "Permanently delete a card. Prefer archive_card for soft removal.",
        inputSchema: DeleteCardParamsSchema.shape,
      },
      async (params) => {
        const validated = DeleteCardParamsSchema.parse(params);
        return this.tools.deleteCard(validated);
      }
    );

    this.server.registerTool(
      "sync_from_agent_teams",
      {
        title: "Sync from Agent Teams",
        description: "Sync tasks from .agent-teams/ directory into a kanban board. Requires KANBAN_AGENT_TEAMS_SYNC=true.",
        inputSchema: SyncFromAgentTeamsParamsSchema.shape,
      },
      async (params) => {
        const validated = SyncFromAgentTeamsParamsSchema.parse(params);
        return this.tools.syncFromAgentTeams(validated);
      }
    );
  }

  async start(): Promise<void> {
    await this.store.load();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Kanban MCP Server started successfully");
  }

  getStore(): KanbanStore {
    return this.store;
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
