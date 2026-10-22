import { z } from "zod";

export class GoogleTasksMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "GoogleTasksMCPError";
  }
}

export interface GoogleTasksClientConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export interface OAuthCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  token_type: string;
}

export interface TaskList {
  id: string;
  title: string;
  updated?: string;
  selfLink?: string;
}

export interface TaskLink {
  type?: string;
  description?: string;
  link?: string;
}

export interface Task {
  id: string;
  title?: string;
  notes?: string;
  status?: "needsAction" | "completed";
  due?: string;
  completed?: string;
  updated?: string;
  parent?: string;
  position?: string;
  deleted?: boolean;
  hidden?: boolean;
  webViewLink?: string;
  links?: TaskLink[];
  assignmentInfo?: Record<string, unknown>;
}

export interface Page<T> {
  items?: T[];
  nextPageToken?: string;
}

export interface McpToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

export const DEFAULT_TASK_LIST = "@default";

const taskListId = z
  .string()
  .min(1)
  .default(DEFAULT_TASK_LIST)
  .describe('Task list id from list_task_lists. "@default" is the account\'s main list ("My Tasks").');

const taskId = z.string().min(1).describe("Task id from list_tasks");

const dueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")
  .describe(
    "Due date as YYYY-MM-DD. Google Tasks stores only the date: a time of day is not supported by the API."
  );

const timestamp = z
  .string()
  .min(1)
  .describe("RFC 3339 timestamp or YYYY-MM-DD (read as midnight UTC)");

export const ListTaskListsParamsSchema = z.object({
  limit: z.number().int().min(1).max(1000).default(100),
});

export const CreateTaskListParamsSchema = z.object({
  title: z.string().min(1).max(1024),
});

export const RenameTaskListParamsSchema = z.object({
  taskListId: z.string().min(1),
  title: z.string().min(1).max(1024),
});

export const DeleteTaskListParamsSchema = z.object({
  taskListId: z.string().min(1),
});

export const ListTasksParamsSchema = z.object({
  taskListId,
  showCompleted: z
    .boolean()
    .default(false)
    .describe("Include completed tasks. Off by default so the answer is the open to-do list."),
  dueMin: timestamp.optional().describe("Only tasks due on or after this date"),
  dueMax: timestamp.optional().describe("Only tasks due before this date (exclusive)"),
  completedMin: timestamp
    .optional()
    .describe("Only tasks completed on or after this date — implies showCompleted"),
  updatedMin: timestamp.optional().describe("Only tasks changed since this timestamp"),
  limit: z.number().int().min(1).max(1000).default(100),
});

export const GetTaskParamsSchema = z.object({
  taskListId,
  taskId,
});

export const CreateTaskParamsSchema = z.object({
  taskListId,
  title: z.string().min(1).max(1024),
  notes: z.string().max(8192).optional().describe("Free-text description"),
  due: dueDate.optional(),
  parentTaskId: z.string().min(1).optional().describe("Create as a subtask of this task"),
  previousTaskId: z
    .string()
    .min(1)
    .optional()
    .describe("Place right after this sibling. Omitted: the task goes to the top"),
});

export const UpdateTaskParamsSchema = z.object({
  taskListId,
  taskId,
  title: z.string().min(1).max(1024).optional(),
  notes: z.string().max(8192).optional().describe("Replaces the notes. Empty string clears them"),
  due: dueDate.nullable().optional().describe("YYYY-MM-DD, or null to remove the due date"),
  status: z.enum(["needsAction", "completed"]).optional(),
});

export const SetTaskCompletedParamsSchema = z.object({
  taskListId,
  taskId,
  completed: z.boolean().default(true).describe("false reopens a completed task"),
});

export const DeleteTaskParamsSchema = z.object({
  taskListId,
  taskId,
});

export const MoveTaskParamsSchema = z.object({
  taskListId,
  taskId,
  parentTaskId: z
    .string()
    .min(1)
    .optional()
    .describe("New parent (turns it into a subtask). Omitted: top level"),
  previousTaskId: z
    .string()
    .min(1)
    .optional()
    .describe("New previous sibling. Omitted: first position"),
  destinationTaskListId: z
    .string()
    .min(1)
    .optional()
    .describe("Move to another list. Subtasks travel with their parent"),
});

export const ClearCompletedParamsSchema = z.object({
  taskListId,
});

export type ListTaskListsParams = z.infer<typeof ListTaskListsParamsSchema>;
export type CreateTaskListParams = z.infer<typeof CreateTaskListParamsSchema>;
export type RenameTaskListParams = z.infer<typeof RenameTaskListParamsSchema>;
export type DeleteTaskListParams = z.infer<typeof DeleteTaskListParamsSchema>;
export type ListTasksParams = z.infer<typeof ListTasksParamsSchema>;
export type GetTaskParams = z.infer<typeof GetTaskParamsSchema>;
export type CreateTaskParams = z.infer<typeof CreateTaskParamsSchema>;
export type UpdateTaskParams = z.infer<typeof UpdateTaskParamsSchema>;
export type SetTaskCompletedParams = z.infer<typeof SetTaskCompletedParamsSchema>;
export type DeleteTaskParams = z.infer<typeof DeleteTaskParamsSchema>;
export type MoveTaskParams = z.infer<typeof MoveTaskParamsSchema>;
export type ClearCompletedParams = z.infer<typeof ClearCompletedParamsSchema>;
