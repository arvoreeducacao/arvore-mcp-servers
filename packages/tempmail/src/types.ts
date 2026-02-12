import { z } from "zod";

export const CreateEmailAccountParamsSchema = z.object({
  username: z
    .string()
    .min(1, "Username is required")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Username can only contain letters, numbers, dots, hyphens, and underscores"
    ),
});

export const ListEmailAccountsParamsSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(20),
});

export const DeleteEmailAccountParamsSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
});

export const GetInboxParamsSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(20),
});

export const ReadEmailParamsSchema = z.object({
  messageId: z.string().min(1, "Message ID is required"),
});

export const DeleteEmailParamsSchema = z.object({
  messageId: z.string().min(1, "Message ID is required"),
});

export type CreateEmailAccountParams = z.infer<
  typeof CreateEmailAccountParamsSchema
>;
export type ListEmailAccountsParams = z.infer<
  typeof ListEmailAccountsParamsSchema
>;
export type DeleteEmailAccountParams = z.infer<
  typeof DeleteEmailAccountParamsSchema
>;
export type GetInboxParams = z.infer<typeof GetInboxParamsSchema>;
export type ReadEmailParams = z.infer<typeof ReadEmailParamsSchema>;
export type DeleteEmailParams = z.infer<typeof DeleteEmailParamsSchema>;


export interface EmailAccount {
  id: string;
  address: string;
  username: string;
  domain: string;
  is_active: boolean;
  created_at: string;
}

export interface EmailMessage {
  id: string;
  account_id: string;
  from_address: string;
  from_name: string;
  to_address: string;
  subject: string;
  text: string;
  html: string;
  has_attachments: boolean;
  size: number;
  seen: boolean;
  created_at: string;
}

export interface CreateMessageData {
  accountId: string;
  fromAddress: string;
  fromName: string;
  toAddress: string;
  subject: string;
  text: string;
  html: string;
  hasAttachments: boolean;
  size: number;
}

export interface EmailStore {
  createAccount(
    username: string,
    domain: string
  ): EmailAccount | Promise<EmailAccount>;
  getAccountById(id: string): EmailAccount | null | Promise<EmailAccount | null>;
  getAccountByAddress(
    address: string
  ): EmailAccount | null | Promise<EmailAccount | null>;
  listAccounts(
    page?: number,
    limit?: number
  ):
    | { accounts: EmailAccount[]; total: number }
    | Promise<{ accounts: EmailAccount[]; total: number }>;
  deleteAccount(id: string): void | Promise<void>;
  createMessage(data: CreateMessageData): EmailMessage | Promise<EmailMessage>;
  getMessageById(
    id: string
  ): EmailMessage | null | Promise<EmailMessage | null>;
  getInbox(
    accountId: string,
    page?: number,
    limit?: number
  ):
    | { messages: EmailMessage[]; total: number }
    | Promise<{ messages: EmailMessage[]; total: number }>;
  deleteMessage(id: string): void | Promise<void>;
  close(): void;
}

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class TempMailMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "TempMailMCPError";
  }
}
