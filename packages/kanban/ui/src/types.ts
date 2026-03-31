export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type SessionStatus = "active" | "paused" | "review" | "completed" | "failed" | "abandoned";

export interface SessionLogEntry {
  session_id: string;
  action: string;
  timestamp: string;
  detail?: string;
}

export interface Column {
  id: string;
  name: string;
  color?: string;
}

export interface CardSession {
  id: string;
  status: SessionStatus;
  started_at: string;
  duration_minutes?: number;
}

export interface Card {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description?: string;
  priority: Priority;
  assignee?: string;
  tags: string[];
  sort_order: number;
  archived: boolean;
  parent_card_id?: string;
  created_at: string;
  updated_at: string;
  session?: CardSession;
  session_id?: string;
  session_status?: SessionStatus;
  session_started_at?: string;
  session_log?: SessionLogEntry[];
  subtasks_count?: number;
  subtasks_done?: number;
}

export interface BoardColumn extends Column {
  cards: Card[];
}

export interface Board {
  id: string;
  name: string;
  description?: string;
  columns: BoardColumn[];
  created_at: string;
  updated_at: string;
}

export interface BoardSummary {
  id: string;
  name: string;
  description?: string;
  columns: number;
  cards_total: number;
  cards_by_column: Record<string, number>;
  active_sessions: number;
  created_at: string;
  updated_at: string;
}

export interface CardDetail extends Card {
  column?: { id: string; name: string };
  subtasks?: Array<{
    id: string;
    title: string;
    column_name: string;
    priority: Priority;
  }>;
}

export interface SearchResult {
  id: string;
  board_id: string;
  board_name: string;
  column_name: string;
  title: string;
  priority: Priority;
  session?: { id: string; status: SessionStatus };
  score: number;
}
