import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import * as lancedb from "@lancedb/lancedb";
import { EmbeddingEngine } from "./embeddings.js";
import {
  type Board,
  type Card,
  type Column,
  type KanbanData,
  type SessionLogEntry,
  type Priority,
  type SessionStatus,
  DEFAULT_COLUMNS,
  KanbanMCPError,
} from "./types.js";

function cardVectorRecord(card: Card, boardName: string, columnName: string, vector: number[]): Record<string, unknown> {
  return {
    id: card.id,
    board_id: card.board_id,
    board_name: boardName,
    column_name: columnName,
    title: card.title,
    description: card.description || "",
    priority: card.priority,
    assignee: card.assignee || "",
    tags: card.tags.join(","),
    archived: card.archived,
    vector,
  };
}

export class KanbanStore {
  private dataPath: string;
  private filePath: string;
  private embeddings: EmbeddingEngine;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private data: KanbanData = { version: 1, boards: [] };
  private defaultReleaseStatus: SessionStatus;

  constructor(dataPath: string, embeddingModel?: string, defaultReleaseStatus?: string) {
    this.dataPath = dataPath;
    this.filePath = join(dataPath, "boards.json");
    this.embeddings = new EmbeddingEngine(embeddingModel);
    this.defaultReleaseStatus = (defaultReleaseStatus || "review") as SessionStatus;
  }

  async load(): Promise<void> {
    await this.embeddings.init();
    if (!existsSync(this.dataPath)) {
      await mkdir(this.dataPath, { recursive: true });
    }
    await this.readFromDisk();
    if (this.embeddings.isReady()) {
      await this.syncVectorStore();
    }
  }

  private async readFromDisk(): Promise<void> {
    if (!existsSync(this.filePath)) {
      this.data = { version: 1, boards: [] };
      return;
    }
    const raw = await readFile(this.filePath, "utf-8");
    this.data = JSON.parse(raw) as KanbanData;
  }

  private async writeToDisk(): Promise<void> {
    const tmpPath = this.filePath + ".tmp";
    await writeFile(tmpPath, JSON.stringify(this.data, null, 2), "utf-8");
    await rename(tmpPath, this.filePath);
  }

  private async syncVectorStore(): Promise<void> {
    const dbPath = join(this.dataPath, ".lancedb");
    this.db = await lancedb.connect(dbPath);
    const records: Record<string, unknown>[] = [];
    for (const board of this.data.boards) {
      for (const card of board.cards) {
        if (card.archived) continue;
        const colName = board.columns.find(c => c.id === card.column_id)?.name || "";
        const text = this.buildCardEmbeddingText(card);
        const vector = await this.embeddings.embed(text);
        records.push(cardVectorRecord(card, board.name, colName, vector));
      }
    }
    if (records.length > 0) {
      this.table = await this.db.createTable("cards", records, { mode: "overwrite" });
    } else {
      this.table = null;
    }
  }

  private buildCardEmbeddingText(card: Card): string {
    return [card.title, card.description || "", card.tags.length > 0 ? `Tags: ${card.tags.join(", ")}` : ""].filter(Boolean).join("\n");
  }

  private async upsertCardVector(card: Card, board: Board): Promise<void> {
    if (!this.embeddings.isReady() || !this.db) return;
    const colName = board.columns.find(c => c.id === card.column_id)?.name || "";
    const text = this.buildCardEmbeddingText(card);
    const vector = await this.embeddings.embed(text);
    const record = cardVectorRecord(card, board.name, colName, vector);
    if (this.table) {
      try { await this.table.delete(`id = '${card.id}'`); } catch { /* noop */ }
      await this.table.add([record]);
    } else {
      this.table = await this.db.createTable("cards", [record], { mode: "overwrite" });
    }
  }

  private async deleteCardVector(cardId: string): Promise<void> {
    if (!this.table) return;
    try { await this.table.delete(`id = '${cardId}'`); } catch { /* noop */ }
  }

  private findBoard(boardId: string): Board {
    const board = this.data.boards.find(b => b.id === boardId);
    if (!board) throw new KanbanMCPError(`Board "${boardId}" not found`, "NOT_FOUND");
    return board;
  }

  private findCard(board: Board, cardId: string): Card {
    const card = board.cards.find(c => c.id === cardId);
    if (!card) throw new KanbanMCPError(`Card "${cardId}" not found in board "${board.id}"`, "NOT_FOUND");
    return card;
  }

  private findColumn(board: Board, columnId: string): Column {
    const col = board.columns.find(c => c.id === columnId);
    if (!col) throw new KanbanMCPError(`Column "${columnId}" not found in board "${board.id}"`, "NOT_FOUND");
    return col;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private addSessionLog(card: Card, sessionId: string, action: string, detail?: string): void {
    if (!card.session_log) card.session_log = [];
    card.session_log.push({ session_id: sessionId, action, timestamp: this.now(), ...(detail ? { detail } : {}) });
  }

  async listBoards(): Promise<Record<string, unknown>> {
    await this.readFromDisk();
    const boards = this.data.boards.map(b => {
      const cardsByColumn: Record<string, number> = {};
      let activeSessions = 0;
      for (const card of b.cards) {
        if (card.archived) continue;
        const colName = b.columns.find(c => c.id === card.column_id)?.name || "Unknown";
        cardsByColumn[colName] = (cardsByColumn[colName] || 0) + 1;
        if (card.session_status === "active") activeSessions++;
      }
      return {
        id: b.id,
        name: b.name,
        description: b.description,
        columns: b.columns.length,
        cards_total: b.cards.filter(c => !c.archived).length,
        cards_by_column: cardsByColumn,
        active_sessions: activeSessions,
        created_at: b.created_at,
        updated_at: b.updated_at,
      };
    });
    return { count: boards.length, boards };
  }

  async createBoard(params: { name: string; description?: string; columns?: { name: string; color?: string }[] }): Promise<Record<string, unknown>> {
    await this.readFromDisk();
    const now = this.now();
    const columns: Column[] = (params.columns || DEFAULT_COLUMNS).map(c => ({
      id: randomUUID(),
      name: c.name,
      color: c.color,
    }));
    const board: Board = {
      id: randomUUID(),
      name: params.name,
      description: params.description,
      columns,
      cards: [],
      created_at: now,
      updated_at: now,
    };
    this.data.boards.push(board);
    await this.writeToDisk();
    return { created: true, id: board.id, name: board.name, columns: board.columns };
  }

  async getBoard(boardId: string, includeArchived = false): Promise<Record<string, unknown>> {
    await this.readFromDisk();
    const board = this.findBoard(boardId);
    const columns = board.columns.map(col => {
      const cards = board.cards
        .filter(c => c.column_id === col.id && (includeArchived || !c.archived) && !c.parent_card_id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(c => {
          const subtasks = board.cards.filter(s => s.parent_card_id === c.id && !s.archived);
          const subtasksDone = subtasks.filter(s => {
            const col = board.columns[board.columns.length - 1];
            return col && s.column_id === col.id;
          }).length;
          const result: Record<string, unknown> = {
            id: c.id,
            title: c.title,
            description: c.description,
            priority: c.priority,
            assignee: c.assignee,
            tags: c.tags,
            sort_order: c.sort_order,
            archived: c.archived,
            subtasks_count: subtasks.length,
            subtasks_done: subtasksDone,
            created_at: c.created_at,
            updated_at: c.updated_at,
          };
          if (c.session_id) {
            const startedAt = c.session_started_at ? new Date(c.session_started_at) : null;
            const durationMinutes = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 60000) : undefined;
            result.session = {
              id: c.session_id,
              status: c.session_status,
              started_at: c.session_started_at,
              duration_minutes: durationMinutes,
            };
          }
          return result;
        });
      return { id: col.id, name: col.name, color: col.color, cards };
    });
    return { id: board.id, name: board.name, description: board.description, columns };
  }

  async getCard(boardId: string, cardId: string): Promise<Record<string, unknown>> {
    await this.readFromDisk();
    const board = this.findBoard(boardId);
    const card = this.findCard(board, cardId);
    const col = board.columns.find(c => c.id === card.column_id);
    const subtasks = board.cards
      .filter(s => s.parent_card_id === card.id && !s.archived)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(s => {
        const sCol = board.columns.find(c => c.id === s.column_id);
        return { id: s.id, title: s.title, column_name: sCol?.name || "", priority: s.priority };
      });
    const sessionInfo = card.session_id ? {
      id: card.session_id,
      status: card.session_status,
      started_at: card.session_started_at,
      duration_minutes: card.session_started_at ? Math.round((Date.now() - new Date(card.session_started_at).getTime()) / 60000) : undefined,
    } : undefined;
    return {
      id: card.id,
      title: card.title,
      description: card.description,
      priority: card.priority,
      column: col ? { id: col.id, name: col.name } : undefined,
      assignee: card.assignee,
      tags: card.tags,
      session: sessionInfo,
      subtasks,
      session_log: card.session_log || [],
      created_at: card.created_at,
      updated_at: card.updated_at,
    };
  }

  async createCard(params: {
    board_id: string;
    column_id: string;
    title: string;
    description?: string;
    priority?: Priority;
    assignee?: string;
    tags?: string[];
    parent_card_id?: string;
  }): Promise<Record<string, unknown>> {
    await this.readFromDisk();
    const board = this.findBoard(params.board_id);
    this.findColumn(board, params.column_id);
    if (params.parent_card_id) this.findCard(board, params.parent_card_id);
    const now = this.now();
    const maxOrder = board.cards
      .filter(c => c.column_id === params.column_id)
      .reduce((max, c) => Math.max(max, c.sort_order), 0);
    const card: Card = {
      id: randomUUID(),
      board_id: params.board_id,
      column_id: params.column_id,
      title: params.title,
      description: params.description,
      priority: params.priority || "none",
      assignee: params.assignee,
      tags: params.tags || [],
      sort_order: maxOrder + 1000,
      archived: false,
      parent_card_id: params.parent_card_id,
      created_at: now,
      updated_at: now,
    };
    board.cards.push(card);
    board.updated_at = now;
    await this.writeToDisk();
    await this.upsertCardVector(card, board);
    return { created: true, id: card.id, board_id: card.board_id, column_id: card.column_id, title: card.title };
  }

  async updateCard(params: {
    board_id: string;
    card_id: string;
    title?: string;
    description?: string;
    priority?: Priority;
    assignee?: string;
    tags?: string[];
    session_id?: string;
  }): Promise<Record<string, unknown>> {
    await this.readFromDisk();
    const board = this.findBoard(params.board_id);
    const card = this.findCard(board, params.card_id);
    const changes: string[] = [];
    if (params.title !== undefined) { card.title = params.title; changes.push("title"); }
    if (params.description !== undefined) { card.description = params.description; changes.push("description"); }
    if (params.priority !== undefined) { card.priority = params.priority; changes.push("priority"); }
    if (params.assignee !== undefined) { card.assignee = params.assignee; changes.push("assignee"); }
    if (params.tags !== undefined) { card.tags = params.tags; changes.push("tags"); }
    card.updated_at = this.now();
    board.updated_at = card.updated_at;
    if (params.session_id) {
      this.addSessionLog(card, params.session_id, `updated ${changes.join(", ")}`);
    }
    await this.writeToDisk();
    await this.upsertCardVector(card, board);
    return { updated: true, id: card.id, title: card.title, column_id: card.column_id };
  }

  async moveCard(params: {
    board_id: string;
    card_id: string;
    column_id: string;
    position?: "top" | "bottom";
    session_id?: string;
  }): Promise<Record<string, unknown>> {
    await this.readFromDisk();
    const board = this.findBoard(params.board_id);
    const card = this.findCard(board, params.card_id);
    const targetCol = this.findColumn(board, params.column_id);
    const fromCol = board.columns.find(c => c.id === card.column_id);
    const fromName = fromCol?.name || "Unknown";
    const colCards = board.cards.filter(c => c.column_id === params.column_id && c.id !== card.id && !c.archived);
    if (params.position === "top") {
      const minOrder = colCards.reduce((min, c) => Math.min(min, c.sort_order), 1000);
      card.sort_order = minOrder - 1000;
    } else {
      const maxOrder = colCards.reduce((max, c) => Math.max(max, c.sort_order), 0);
      card.sort_order = maxOrder + 1000;
    }
    card.column_id = params.column_id;
    card.updated_at = this.now();
    board.updated_at = card.updated_at;
    if (params.session_id) {
      this.addSessionLog(card, params.session_id, `moved from ${fromName} to ${targetCol.name}`);
    }
    await this.writeToDisk();
    await this.upsertCardVector(card, board);
    return { moved: true, id: card.id, from_column: fromName, to_column: targetCol.name, sort_order: card.sort_order };
  }

  async claimCard(params: {
    board_id: string;
    card_id: string;
    session_id: string;
    force?: boolean;
  }): Promise<Record<string, unknown>> {
    await this.readFromDisk();
    const board = this.findBoard(params.board_id);
    const card = this.findCard(board, params.card_id);
    if (card.session_id && card.session_status === "active" && !params.force) {
      const startedAt = card.session_started_at ? new Date(card.session_started_at) : null;
      const durationMinutes = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 60000) : undefined;
      return {
        claimed: false,
        id: card.id,
        current_session: {
          id: card.session_id,
          status: card.session_status,
          started_at: card.session_started_at,
          duration_minutes: durationMinutes,
        },
        hint: "Use force=true to override, or pick another card",
      };
    }
    const now = this.now();
    card.session_id = params.session_id;
    card.session_status = "active";
    card.session_started_at = now;
    card.updated_at = now;
    board.updated_at = now;
    this.addSessionLog(card, params.session_id, "claimed");
    await this.writeToDisk();
    return { claimed: true, id: card.id, session_id: params.session_id, title: card.title };
  }

  async releaseCard(params: {
    board_id: string;
    card_id: string;
    session_id: string;
    status?: string;
    detail?: string;
  }): Promise<Record<string, unknown>> {
    await this.readFromDisk();
    const board = this.findBoard(params.board_id);
    const card = this.findCard(board, params.card_id);
    const releaseStatus = (params.status || this.defaultReleaseStatus) as SessionStatus;
    const now = this.now();
    card.session_status = releaseStatus;
    card.session_id = undefined;
    card.session_started_at = undefined;
    card.updated_at = now;
    board.updated_at = now;
    this.addSessionLog(card, params.session_id, `released with status ${releaseStatus}`, params.detail);
    await this.writeToDisk();
    return { released: true, id: card.id, session_status: releaseStatus, title: card.title };
  }

  async searchCards(params: { query: string; board_id?: string; limit?: number }): Promise<Record<string, unknown>> {
    await this.readFromDisk();
    const limit = params.limit || 10;

    if (this.embeddings.isReady() && this.table) {
      const queryVector = await this.embeddings.embed(params.query);
      const searchQuery = this.table.search(queryVector).limit(limit);
      if (params.board_id) searchQuery.where(`board_id = '${params.board_id}'`);
      searchQuery.where("archived = false");
      const results = await searchQuery.toArray();
      const mapped = results.map((row: Record<string, unknown>) => {
        const boardData = this.data.boards.find(b => b.id === row.board_id);
        const card = boardData?.cards.find(c => c.id === row.id);
        const sessionInfo = card?.session_id ? { id: card.session_id, status: card.session_status } : undefined;
        return {
          id: row.id as string,
          board_id: row.board_id as string,
          board_name: row.board_name as string,
          column_name: row.column_name as string,
          title: row.title as string,
          priority: row.priority as string,
          session: sessionInfo,
          score: round(1 - ((row._distance as number) || 0)),
        };
      });
      return { query: params.query, count: mapped.length, results: mapped };
    }

    const allCards: { card: Card; board: Board }[] = [];
    for (const board of this.data.boards) {
      if (params.board_id && board.id !== params.board_id) continue;
      for (const card of board.cards) {
        if (!card.archived) allCards.push({ card, board });
      }
    }
    const queryTerms = params.query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = allCards.map(({ card, board }) => {
      let score = 0;
      for (const term of queryTerms) {
        if (card.title.toLowerCase().includes(term)) score += 10;
        if (card.tags.some(t => t.toLowerCase().includes(term))) score += 8;
        if (card.description?.toLowerCase().includes(term)) score += 3;
      }
      return { card, board, score: score / 10 };
    });
    const results = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => {
        const colName = s.board.columns.find(c => c.id === s.card.column_id)?.name || "";
        const sessionInfo = s.card.session_id ? { id: s.card.session_id, status: s.card.session_status } : undefined;
        return {
          id: s.card.id,
          board_id: s.board.id,
          board_name: s.board.name,
          column_name: colName,
          title: s.card.title,
          priority: s.card.priority,
          session: sessionInfo,
          score: round(s.score),
        };
      });
    return { query: params.query, count: results.length, results };
  }

  async archiveCard(params: { board_id: string; card_id: string }): Promise<Record<string, unknown>> {
    await this.readFromDisk();
    const board = this.findBoard(params.board_id);
    const card = this.findCard(board, params.card_id);
    card.archived = true;
    card.updated_at = this.now();
    board.updated_at = card.updated_at;
    await this.writeToDisk();
    await this.deleteCardVector(card.id);
    return { archived: true, id: card.id, title: card.title };
  }

  async deleteCard(params: { board_id: string; card_id: string }): Promise<Record<string, unknown>> {
    await this.readFromDisk();
    const board = this.findBoard(params.board_id);
    const cardIdx = board.cards.findIndex(c => c.id === params.card_id);
    if (cardIdx === -1) throw new KanbanMCPError(`Card "${params.card_id}" not found in board "${params.board_id}"`, "NOT_FOUND");
    board.cards.splice(cardIdx, 1);
    board.updated_at = this.now();
    await this.writeToDisk();
    await this.deleteCardVector(params.card_id);
    return { deleted: true, id: params.card_id };
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
