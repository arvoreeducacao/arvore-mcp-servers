import { z } from "zod";

export const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
export const SESSION_STATUSES = ["active", "paused", "review", "completed", "failed", "abandoned"] as const;
export const RELEASE_STATUSES = ["review", "completed", "paused", "failed", "abandoned"] as const;

export type Priority = (typeof PRIORITIES)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];

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
  session_id?: string;
  session_status?: SessionStatus;
  session_started_at?: string;
  session_log?: SessionLogEntry[];
}

export interface Board {
  id: string;
  name: string;
  description?: string;
  columns: Column[];
  cards: Card[];
  created_at: string;
  updated_at: string;
}

export interface KanbanData {
  version: number;
  boards: Board[];
}

export const DEFAULT_COLUMNS: { name: string; color: string }[] = [
  { name: "Backlog", color: "#6b7280" },
  { name: "Todo", color: "#3b82f6" },
  { name: "In Progress", color: "#f59e0b" },
  { name: "Done", color: "#10b981" },
];

export const ListBoardsParamsSchema = z.object({});

export const CreateBoardParamsSchema = z.object({
  name: z.string().min(1, "Board name is required"),
  description: z.string().optional(),
  columns: z.array(z.object({ name: z.string().min(1), color: z.string().optional() })).optional(),
});

export const GetBoardParamsSchema = z.object({
  board_id: z.string().min(1, "Board ID is required"),
  include_archived: z.boolean().optional().default(false),
});

export const GetCardParamsSchema = z.object({
  board_id: z.string().min(1, "Board ID is required"),
  card_id: z.string().min(1, "Card ID is required"),
});

export const CreateCardParamsSchema = z.object({
  board_id: z.string().min(1, "Board ID is required"),
  column_id: z.string().min(1, "Column ID is required"),
  title: z.string().min(1, "Card title is required"),
  description: z.string().optional(),
  priority: z.enum(PRIORITIES).optional().default("none"),
  assignee: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  parent_card_id: z.string().optional(),
});

export const UpdateCardParamsSchema = z.object({
  board_id: z.string().min(1, "Board ID is required"),
  card_id: z.string().min(1, "Card ID is required"),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignee: z.string().optional(),
  tags: z.array(z.string()).optional(),
  session_id: z.string().optional(),
});

export const MoveCardParamsSchema = z.object({
  board_id: z.string().min(1, "Board ID is required"),
  card_id: z.string().min(1, "Card ID is required"),
  column_id: z.string().min(1, "Target column ID is required"),
  position: z.enum(["top", "bottom"]).optional().default("bottom"),
  session_id: z.string().optional(),
});

export const ClaimCardParamsSchema = z.object({
  board_id: z.string().min(1, "Board ID is required"),
  card_id: z.string().min(1, "Card ID is required"),
  session_id: z.string().min(1, "Session ID is required"),
  force: z.boolean().optional().default(false),
});

export const ReleaseCardParamsSchema = z.object({
  board_id: z.string().min(1, "Board ID is required"),
  card_id: z.string().min(1, "Card ID is required"),
  session_id: z.string().min(1, "Session ID is required"),
  status: z.enum(RELEASE_STATUSES).optional(),
  detail: z.string().optional(),
});

export const SearchCardsParamsSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  board_id: z.string().optional(),
  limit: z.number().int().positive().max(50).optional().default(10),
});

export const ArchiveCardParamsSchema = z.object({
  board_id: z.string().min(1, "Board ID is required"),
  card_id: z.string().min(1, "Card ID is required"),
});

export const DeleteCardParamsSchema = z.object({
  board_id: z.string().min(1, "Board ID is required"),
  card_id: z.string().min(1, "Card ID is required"),
});

export const SyncFromAgentTeamsParamsSchema = z.object({
  board_id: z.string().min(1, "Board ID is required"),
});

export type ListBoardsParams = z.infer<typeof ListBoardsParamsSchema>;
export type CreateBoardParams = z.infer<typeof CreateBoardParamsSchema>;
export type GetBoardParams = z.infer<typeof GetBoardParamsSchema>;
export type GetCardParams = z.infer<typeof GetCardParamsSchema>;
export type CreateCardParams = z.infer<typeof CreateCardParamsSchema>;
export type UpdateCardParams = z.infer<typeof UpdateCardParamsSchema>;
export type MoveCardParams = z.infer<typeof MoveCardParamsSchema>;
export type ClaimCardParams = z.infer<typeof ClaimCardParamsSchema>;
export type ReleaseCardParams = z.infer<typeof ReleaseCardParamsSchema>;
export type SearchCardsParams = z.infer<typeof SearchCardsParamsSchema>;
export type ArchiveCardParams = z.infer<typeof ArchiveCardParamsSchema>;
export type DeleteCardParams = z.infer<typeof DeleteCardParamsSchema>;
export type SyncFromAgentTeamsParams = z.infer<typeof SyncFromAgentTeamsParamsSchema>;

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
}

export class KanbanMCPError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "KanbanMCPError";
  }
}
