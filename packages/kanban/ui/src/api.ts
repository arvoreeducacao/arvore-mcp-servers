import type {
  Board,
  BoardSummary,
  CardDetail,
  Priority,
  SearchResult,
} from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function listBoards(): Promise<{
  count: number;
  boards: BoardSummary[];
}> {
  return request("/api/boards");
}

export async function createBoard(data: {
  name: string;
  description?: string;
  columns?: { name: string; color?: string }[];
}): Promise<{ created: boolean; id: string; name: string }> {
  return request("/api/boards", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getBoard(
  id: string,
  includeArchived = false
): Promise<Board> {
  const params = includeArchived ? "?include_archived=true" : "";
  return request(`/api/boards/${id}${params}`);
}

export async function getCard(
  boardId: string,
  cardId: string
): Promise<CardDetail> {
  return request(`/api/boards/${boardId}/cards/${cardId}`);
}

export async function createCard(
  boardId: string,
  data: {
    column_id: string;
    title: string;
    description?: string;
    priority?: Priority;
    assignee?: string;
    tags?: string[];
    parent_card_id?: string;
  }
): Promise<{ created: boolean; id: string }> {
  return request(`/api/boards/${boardId}/cards`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCard(
  boardId: string,
  cardId: string,
  data: {
    title?: string;
    description?: string;
    priority?: Priority;
    assignee?: string;
    tags?: string[];
  }
): Promise<{ updated: boolean }> {
  return request(`/api/boards/${boardId}/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function moveCard(
  boardId: string,
  cardId: string,
  data: { column_id: string; position?: "top" | "bottom" }
): Promise<{ moved: boolean }> {
  return request(`/api/boards/${boardId}/cards/${cardId}/move`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function archiveCard(
  boardId: string,
  cardId: string
): Promise<{ archived: boolean }> {
  return request(`/api/boards/${boardId}/cards/${cardId}/archive`, {
    method: "POST",
  });
}

export async function deleteCard(
  boardId: string,
  cardId: string
): Promise<{ deleted: boolean }> {
  return request(`/api/boards/${boardId}/cards/${cardId}`, {
    method: "DELETE",
  });
}

export async function searchCards(data: {
  query: string;
  board_id?: string;
  limit?: number;
}): Promise<{ query: string; count: number; results: SearchResult[] }> {
  return request("/api/search", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
