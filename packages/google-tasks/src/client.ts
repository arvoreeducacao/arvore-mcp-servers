import { refreshAccessToken } from "./oauth.js";
import { GoogleTasksClientConfig, GoogleTasksMCPError, Page, Task, TaskList } from "./types.js";

const TASKS_API = "https://tasks.googleapis.com/tasks/v1";
const TOKEN_SKEW_MS = 60_000;
const API_PAGE_SIZE = 100;

type Query = Record<string, string | undefined>;

export class GoogleTasksClient {
  private config: GoogleTasksClientConfig;
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshing: Promise<string> | null = null;

  constructor(config: GoogleTasksClientConfig) {
    this.config = config;
  }

  private async token(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - TOKEN_SKEW_MS) {
      return this.accessToken;
    }

    if (!this.refreshing) {
      this.refreshing = refreshAccessToken({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        refreshToken: this.config.refreshToken,
      })
        .then((tokens) => {
          this.accessToken = tokens.access_token;
          this.expiresAt = tokens.expires_at;
          return tokens.access_token;
        })
        .finally(() => {
          this.refreshing = null;
        });
    }

    return this.refreshing;
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown; query?: Query } = {}
  ): Promise<T> {
    const base = new URL(TASKS_API);
    const url = new URL(`${TASKS_API}${path}`);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      throw new GoogleTasksMCPError(`Refusing to call ${url.toString()}`, "INVALID_PARAMS");
    }
    for (const [key, value] of Object.entries(init.query || {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    const token = await this.token();
    const response = await fetch(url.toString(), {
      method: init.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new GoogleTasksMCPError(
        `Google Tasks API error ${response.status}: ${detail.slice(0, 1200)}`,
        response.status === 404 ? "NOT_FOUND" : "API_ERROR",
        response.status
      );
    }

    if (response.status === 204) return {} as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  private async collect<T>(path: string, query: Query, limit: number): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;

    do {
      const page = await this.request<Page<T>>(path, {
        query: {
          ...query,
          maxResults: String(Math.min(API_PAGE_SIZE, limit - items.length)),
          pageToken,
        },
      });
      items.push(...(page.items || []));
      pageToken = page.nextPageToken;
    } while (pageToken && items.length < limit);

    return items.slice(0, limit);
  }

  listTaskLists(limit: number): Promise<TaskList[]> {
    return this.collect<TaskList>("/users/@me/lists", {}, limit);
  }

  createTaskList(title: string): Promise<TaskList> {
    return this.request<TaskList>("/users/@me/lists", { method: "POST", body: { title } });
  }

  renameTaskList(taskListId: string, title: string): Promise<TaskList> {
    return this.request<TaskList>(`/users/@me/lists/${encodeURIComponent(taskListId)}`, {
      method: "PATCH",
      body: { title },
    });
  }

  async deleteTaskList(taskListId: string): Promise<void> {
    await this.request(`/users/@me/lists/${encodeURIComponent(taskListId)}`, {
      method: "DELETE",
    });
  }

  listTasks(taskListId: string, query: Query, limit: number): Promise<Task[]> {
    return this.collect<Task>(`/lists/${encodeURIComponent(taskListId)}/tasks`, query, limit);
  }

  getTask(taskListId: string, taskId: string): Promise<Task> {
    return this.request<Task>(taskPath(taskListId, taskId));
  }

  createTask(
    taskListId: string,
    body: Partial<Task>,
    placement: { parent?: string; previous?: string }
  ): Promise<Task> {
    return this.request<Task>(`/lists/${encodeURIComponent(taskListId)}/tasks`, {
      method: "POST",
      body,
      query: placement,
    });
  }

  patchTask(taskListId: string, taskId: string, body: Record<string, unknown>): Promise<Task> {
    return this.request<Task>(taskPath(taskListId, taskId), { method: "PATCH", body });
  }

  async deleteTask(taskListId: string, taskId: string): Promise<void> {
    await this.request(taskPath(taskListId, taskId), { method: "DELETE" });
  }

  moveTask(
    taskListId: string,
    taskId: string,
    placement: { parent?: string; previous?: string; destinationTasklist?: string }
  ): Promise<Task> {
    return this.request<Task>(`${taskPath(taskListId, taskId)}/move`, {
      method: "POST",
      query: placement,
    });
  }

  async clearCompleted(taskListId: string): Promise<void> {
    await this.request(`/lists/${encodeURIComponent(taskListId)}/clear`, { method: "POST" });
  }
}

function taskPath(taskListId: string, taskId: string): string {
  return `/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`;
}
