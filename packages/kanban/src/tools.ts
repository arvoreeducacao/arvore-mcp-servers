import { KanbanStore } from "./store.js";
import {
  type ListBoardsParams,
  type CreateBoardParams,
  type GetBoardParams,
  type GetCardParams,
  type CreateCardParams,
  type UpdateCardParams,
  type MoveCardParams,
  type ClaimCardParams,
  type ReleaseCardParams,
  type SearchCardsParams,
  type ArchiveCardParams,
  type DeleteCardParams,
  type SyncFromAgentTeamsParams,
  type McpToolResult,
  KanbanMCPError,
} from "./types.js";

export class KanbanMCPTools {
  constructor(private store: KanbanStore) {}

  async listBoards(_params: ListBoardsParams): Promise<McpToolResult> {
    try {
      const result = await this.store.listBoards();
      return this.ok(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async createBoard(params: CreateBoardParams): Promise<McpToolResult> {
    try {
      const result = await this.store.createBoard(params);
      return this.ok(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async getBoard(params: GetBoardParams): Promise<McpToolResult> {
    try {
      const result = await this.store.getBoard(params.board_id, params.include_archived);
      return this.ok(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async getCard(params: GetCardParams): Promise<McpToolResult> {
    try {
      const result = await this.store.getCard(params.board_id, params.card_id);
      return this.ok(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async createCard(params: CreateCardParams): Promise<McpToolResult> {
    try {
      const result = await this.store.createCard(params);
      return this.ok(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async updateCard(params: UpdateCardParams): Promise<McpToolResult> {
    try {
      const result = await this.store.updateCard(params);
      return this.ok(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async moveCard(params: MoveCardParams): Promise<McpToolResult> {
    try {
      const result = await this.store.moveCard(params);
      return this.ok(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async claimCard(params: ClaimCardParams): Promise<McpToolResult> {
    try {
      const result = await this.store.claimCard(params);
      return this.ok(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async releaseCard(params: ReleaseCardParams): Promise<McpToolResult> {
    try {
      const result = await this.store.releaseCard(params);
      return this.ok(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async searchCards(params: SearchCardsParams): Promise<McpToolResult> {
    try {
      const result = await this.store.searchCards(params);
      return this.ok(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async archiveCard(params: ArchiveCardParams): Promise<McpToolResult> {
    try {
      const result = await this.store.archiveCard(params);
      return this.ok(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async deleteCard(params: DeleteCardParams): Promise<McpToolResult> {
    try {
      const result = await this.store.deleteCard(params);
      return this.ok(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async syncFromAgentTeams(_params: SyncFromAgentTeamsParams): Promise<McpToolResult> {
    if (!process.env.KANBAN_AGENT_TEAMS_SYNC) {
      return this.ok({ error: "sync_from_agent_teams is not enabled. Set KANBAN_AGENT_TEAMS_SYNC=true to enable." });
    }
    return this.ok({ error: "sync_from_agent_teams is not implemented yet." });
  }

  private ok(data: Record<string, unknown>): McpToolResult {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }

  private errorResult(error: unknown): McpToolResult {
    const message =
      error instanceof KanbanMCPError
        ? `Kanban Error: ${error.message}`
        : `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`;
    return { content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }] };
  }
}
