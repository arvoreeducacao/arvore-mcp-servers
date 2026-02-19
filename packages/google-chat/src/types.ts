import { z } from "zod";

export const SpacesListParamsSchema = z.object({
  filter: z
    .string()
    .optional()
    .describe(
      'Filter by space type. Example: \'spaceType = "SPACE"\' or \'spaceType = "GROUP_CHAT" OR spaceType = "DIRECT_MESSAGE"\''
    ),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .default(100)
    .describe("Maximum number of spaces to return (max 1000)"),
  pageToken: z
    .string()
    .optional()
    .describe("Page token from a previous request for pagination"),
});

export const SpacesGetParamsSchema = z.object({
  spaceName: z
    .string()
    .min(1)
    .describe(
      'Space resource name (e.g., "spaces/AAAA") or just the space ID (e.g., "AAAA")'
    ),
});

export const MembersListParamsSchema = z.object({
  spaceName: z
    .string()
    .min(1)
    .describe(
      'Space resource name (e.g., "spaces/AAAA") or just the space ID'
    ),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .default(100)
    .describe("Maximum number of members to return (max 1000)"),
  pageToken: z
    .string()
    .optional()
    .describe("Page token from a previous request for pagination"),
});

export const MessagesListParamsSchema = z.object({
  spaceName: z
    .string()
    .min(1)
    .describe(
      'Space resource name (e.g., "spaces/AAAA") or just the space ID'
    ),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .default(25)
    .describe("Maximum number of messages to return (max 1000)"),
  pageToken: z
    .string()
    .optional()
    .describe("Page token from a previous request for pagination"),
  filter: z
    .string()
    .optional()
    .describe(
      'Filter messages. Example: \'createTime > "2024-01-01T00:00:00Z"\' or \'thread.name = "spaces/AAAA/threads/BBBB"\''
    ),
  orderBy: z
    .string()
    .optional()
    .default("createTime desc")
    .describe(
      'Order by field. Supports "createTime asc" or "createTime desc" (default)'
    ),
  showDeleted: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include deleted messages"),
});

export const MessagesGetParamsSchema = z.object({
  messageName: z
    .string()
    .min(1)
    .describe(
      'Full message resource name (e.g., "spaces/AAAA/messages/BBBB")'
    ),
});

export const MessagesCreateParamsSchema = z.object({
  spaceName: z
    .string()
    .min(1)
    .describe(
      'Space resource name (e.g., "spaces/AAAA") or just the space ID'
    ),
  text: z.string().min(1).describe("Message text content"),
  threadKey: z
    .string()
    .optional()
    .describe(
      "Thread key for creating a new thread or replying to an existing one"
    ),
  threadName: z
    .string()
    .optional()
    .describe(
      'Existing thread resource name to reply to (e.g., "spaces/AAAA/threads/BBBB")'
    ),
  messageReplyOption: z
    .enum(["MESSAGE_REPLY_OPTION_UNSPECIFIED", "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD", "REPLY_MESSAGE_OR_FAIL"])
    .optional()
    .default("REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD")
    .describe("How to handle thread replies when threadKey or threadName is set"),
});

export const MessagesDeleteParamsSchema = z.object({
  messageName: z
    .string()
    .min(1)
    .describe(
      'Full message resource name (e.g., "spaces/AAAA/messages/BBBB")'
    ),
});

export type SpacesListParams = z.infer<typeof SpacesListParamsSchema>;
export type SpacesGetParams = z.infer<typeof SpacesGetParamsSchema>;
export type MembersListParams = z.infer<typeof MembersListParamsSchema>;
export type MessagesListParams = z.infer<typeof MessagesListParamsSchema>;
export type MessagesGetParams = z.infer<typeof MessagesGetParamsSchema>;
export type MessagesCreateParams = z.infer<typeof MessagesCreateParamsSchema>;
export type MessagesDeleteParams = z.infer<typeof MessagesDeleteParamsSchema>;

export interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface GoogleChatClientConfig {
  credentialsPath?: string;
  credentialsJson?: string;
  userEmail?: string;
  scopes?: string[];
}

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class GoogleChatMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "GoogleChatMCPError";
  }
}
