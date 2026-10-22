import { GoogleTasksClient } from "./client.js";
import {
  ClearCompletedParams,
  CreateTaskListParams,
  CreateTaskParams,
  DeleteTaskListParams,
  DeleteTaskParams,
  GetTaskParams,
  GoogleTasksMCPError,
  ListTaskListsParams,
  ListTasksParams,
  McpToolResult,
  MoveTaskParams,
  RenameTaskListParams,
  SetTaskCompletedParams,
  Task,
  TaskList,
  UpdateTaskParams,
} from "./types.js";

export class GoogleTasksMCPTools {
  constructor(private client: GoogleTasksClient) {}

  async listTaskLists(params: ListTaskListsParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const lists = await this.client.listTaskLists(params.limit);
      return json({ count: lists.length, taskLists: lists.map(summarizeList) });
    });
  }

  async createTaskList(params: CreateTaskListParams): Promise<McpToolResult> {
    return this.guard(async () => json(summarizeList(await this.client.createTaskList(params.title))));
  }

  async renameTaskList(params: RenameTaskListParams): Promise<McpToolResult> {
    return this.guard(async () =>
      json(summarizeList(await this.client.renameTaskList(params.taskListId, params.title)))
    );
  }

  async deleteTaskList(params: DeleteTaskListParams): Promise<McpToolResult> {
    return this.guard(async () => {
      await this.client.deleteTaskList(params.taskListId);
      return json({ deleted: true, taskListId: params.taskListId });
    });
  }

  async listTasks(params: ListTasksParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const includeCompleted = params.showCompleted || !!params.completedMin;
      const tasks = await this.client.listTasks(
        params.taskListId,
        {
          showCompleted: String(includeCompleted),
          showHidden: String(includeCompleted),
          dueMin: toTimestamp(params.dueMin),
          dueMax: toTimestamp(params.dueMax),
          completedMin: toTimestamp(params.completedMin),
          updatedMin: toTimestamp(params.updatedMin),
        },
        params.limit
      );
      return json({
        taskListId: params.taskListId,
        count: tasks.length,
        tasks: tasks.map(summarizeTask),
      });
    });
  }

  async getTask(params: GetTaskParams): Promise<McpToolResult> {
    return this.guard(async () =>
      json(summarizeTask(await this.client.getTask(params.taskListId, params.taskId)))
    );
  }

  async createTask(params: CreateTaskParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const task = await this.client.createTask(
        params.taskListId,
        {
          title: params.title,
          ...(params.notes !== undefined ? { notes: params.notes } : {}),
          ...(params.due ? { due: dueToTimestamp(params.due) } : {}),
        },
        { parent: params.parentTaskId, previous: params.previousTaskId }
      );
      return json(summarizeTask(task));
    });
  }

  async updateTask(params: UpdateTaskParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const patch = buildPatch(params);
      if (Object.keys(patch).length === 0) {
        throw new GoogleTasksMCPError("Nothing to update: pass title, notes, due or status", "INVALID_PARAMS");
      }
      return json(summarizeTask(await this.client.patchTask(params.taskListId, params.taskId, patch)));
    });
  }

  async setTaskCompleted(params: SetTaskCompletedParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const patch = params.completed
        ? { status: "completed" }
        : { status: "needsAction", completed: null };
      return json(summarizeTask(await this.client.patchTask(params.taskListId, params.taskId, patch)));
    });
  }

  async deleteTask(params: DeleteTaskParams): Promise<McpToolResult> {
    return this.guard(async () => {
      await this.client.deleteTask(params.taskListId, params.taskId);
      return json({ deleted: true, taskListId: params.taskListId, taskId: params.taskId });
    });
  }

  async moveTask(params: MoveTaskParams): Promise<McpToolResult> {
    return this.guard(async () => {
      const task = await this.client.moveTask(params.taskListId, params.taskId, {
        parent: params.parentTaskId,
        previous: params.previousTaskId,
        destinationTasklist: params.destinationTaskListId,
      });
      return json(summarizeTask(task));
    });
  }

  async clearCompleted(params: ClearCompletedParams): Promise<McpToolResult> {
    return this.guard(async () => {
      await this.client.clearCompleted(params.taskListId);
      return json({ cleared: true, taskListId: params.taskListId });
    });
  }

  private async guard(action: () => Promise<McpToolResult>): Promise<McpToolResult> {
    try {
      return await action();
    } catch (error) {
      const message =
        error instanceof GoogleTasksMCPError
          ? `${error.code}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "unknown error";

      return {
        content: [{ type: "text" as const, text: message }],
        isError: true,
      };
    }
  }
}

export function buildPatch(params: UpdateTaskParams): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (params.title !== undefined) patch.title = params.title;
  if (params.notes !== undefined) patch.notes = params.notes;
  if (params.due !== undefined) patch.due = params.due === null ? null : dueToTimestamp(params.due);
  if (params.status !== undefined) {
    patch.status = params.status;
    if (params.status === "needsAction") patch.completed = null;
  }
  return patch;
}

export function dueToTimestamp(date: string): string {
  return `${date}T00:00:00.000Z`;
}

export function toTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? dueToTimestamp(value) : value;
}

export function summarizeList(list: TaskList) {
  return { taskListId: list.id, title: list.title, updated: list.updated };
}

export function summarizeTask(task: Task) {
  return {
    taskId: task.id,
    title: task.title,
    status: task.status,
    due: task.due ? task.due.slice(0, 10) : undefined,
    notes: task.notes || undefined,
    completed: task.completed,
    parentTaskId: task.parent,
    updated: task.updated,
    link: task.webViewLink,
    links: task.links?.length ? task.links : undefined,
    assigned: task.assignmentInfo ? true : undefined,
  };
}

function json(payload: unknown): McpToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}
