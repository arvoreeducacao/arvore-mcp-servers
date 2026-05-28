import { z } from "zod";

export const MessagesListParamsSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'Gmail search query (e.g. "from:alice@example.com newer_than:7d is:unread", "subject:invoice has:attachment")'
    ),
  labelIds: z
    .array(z.string())
    .optional()
    .describe(
      'Filter by label IDs (e.g. ["INBOX", "UNREAD", "STARRED"]). Use labels_list to discover IDs.'
    ),
  maxResults: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .default(25)
    .describe("Maximum number of messages to return (max 500)"),
  pageToken: z
    .string()
    .optional()
    .describe("Page token from a previous request for pagination"),
  includeSpamTrash: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include messages from SPAM and TRASH"),
});

export const MessagesGetParamsSchema = z.object({
  messageId: z.string().min(1).describe("Gmail message ID"),
  format: z
    .enum(["minimal", "full", "raw", "metadata"])
    .optional()
    .default("full")
    .describe(
      'Response format: "full" (default) returns parsed body + headers, "metadata" returns headers only, "minimal" returns IDs only, "raw" returns the original RFC 2822 message'
    ),
});

export const MessagesSendParamsSchema = z.object({
  to: z
    .array(z.string().email())
    .min(1)
    .describe("Recipient email addresses"),
  cc: z.array(z.string().email()).optional().describe("CC recipients"),
  bcc: z.array(z.string().email()).optional().describe("BCC recipients"),
  subject: z.string().min(1).describe("Email subject"),
  body: z.string().min(1).describe("Email body content"),
  bodyType: z
    .enum(["text", "html"])
    .optional()
    .default("text")
    .describe('Body content type: "text" (default) or "html"'),
  replyToMessageId: z
    .string()
    .optional()
    .describe(
      "Optional Gmail message ID to reply to — automatically sets In-Reply-To, References, and threadId"
    ),
});

export const DraftsCreateParamsSchema = z.object({
  to: z
    .array(z.string().email())
    .min(1)
    .describe("Recipient email addresses"),
  cc: z.array(z.string().email()).optional().describe("CC recipients"),
  bcc: z.array(z.string().email()).optional().describe("BCC recipients"),
  subject: z.string().min(1).describe("Email subject"),
  body: z.string().min(1).describe("Email body content"),
  bodyType: z
    .enum(["text", "html"])
    .optional()
    .default("text")
    .describe('Body content type: "text" (default) or "html"'),
  replyToMessageId: z
    .string()
    .optional()
    .describe(
      "Optional Gmail message ID to reply to — automatically sets In-Reply-To, References, and threadId"
    ),
});

export const DraftsListParamsSchema = z.object({
  query: z.string().optional().describe("Gmail search query for drafts"),
  maxResults: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .default(25)
    .describe("Maximum number of drafts to return (max 500)"),
  pageToken: z
    .string()
    .optional()
    .describe("Page token from a previous request for pagination"),
});

export const DraftsSendParamsSchema = z.object({
  draftId: z.string().min(1).describe("Draft ID returned by drafts_create"),
});

export const ThreadsGetParamsSchema = z.object({
  threadId: z.string().min(1).describe("Gmail thread ID"),
  format: z
    .enum(["minimal", "full", "metadata"])
    .optional()
    .default("full")
    .describe('Response format for messages within the thread'),
});

export const MessagesModifyParamsSchema = z.object({
  messageId: z.string().min(1).describe("Gmail message ID"),
  addLabelIds: z
    .array(z.string())
    .optional()
    .describe('Label IDs to add (e.g. ["STARRED"])'),
  removeLabelIds: z
    .array(z.string())
    .optional()
    .describe('Label IDs to remove (e.g. ["UNREAD", "INBOX"])'),
});

export const MessagesTrashParamsSchema = z.object({
  messageId: z.string().min(1).describe("Gmail message ID to move to trash"),
});

export const LabelsListParamsSchema = z.object({});

export const ProfileGetParamsSchema = z.object({});

export type MessagesListParams = z.infer<typeof MessagesListParamsSchema>;
export type MessagesGetParams = z.infer<typeof MessagesGetParamsSchema>;
export type MessagesSendParams = z.infer<typeof MessagesSendParamsSchema>;
export type DraftsCreateParams = z.infer<typeof DraftsCreateParamsSchema>;
export type DraftsListParams = z.infer<typeof DraftsListParamsSchema>;
export type DraftsSendParams = z.infer<typeof DraftsSendParamsSchema>;
export type ThreadsGetParams = z.infer<typeof ThreadsGetParamsSchema>;
export type MessagesModifyParams = z.infer<typeof MessagesModifyParamsSchema>;
export type MessagesTrashParams = z.infer<typeof MessagesTrashParamsSchema>;
export type LabelsListParams = z.infer<typeof LabelsListParamsSchema>;
export type ProfileGetParams = z.infer<typeof ProfileGetParamsSchema>;

export interface OAuthCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  token_type: string;
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export interface GmailClientConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  configDir?: string;
  redirectPort?: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface GmailMessage {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPayload;
  sizeEstimate?: number;
  historyId?: string;
  internalDate?: string;
  raw?: string;
}

export interface GmailPayload {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPayload[];
}

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class GmailMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "GmailMCPError";
  }
}
