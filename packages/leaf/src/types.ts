import { z } from "zod";

export const LeafConfigSchema = z.object({
  databaseUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("mysql://"), {
      message: "LEAF_DATABASE_URL must be a mysql:// URL",
    }),
  baseUrl: z.string().url().default("https://leaf.arvore.com.br"),
  connectionTimeout: z.number().int().positive().default(30000),
});

export type LeafConfig = z.infer<typeof LeafConfigSchema>;
export type LeafConfigInput = z.input<typeof LeafConfigSchema>;

export const SearchDocumentsParamsSchema = z.object({
  query: z.string().min(1).describe("Text to search in titles and bodies"),
  limit: z.number().int().min(1).max(50).default(10),
});

export const GetDocumentParamsSchema = z.object({
  documentId: z.string().min(1).max(21).describe("Document id"),
});

export const ListDocumentsParamsSchema = z.object({
  orgId: z.string().min(1).max(21).optional(),
  ownerEmail: z.string().email().optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export const GetDatabaseParamsSchema = z.object({
  databaseId: z.string().min(1).max(21).describe("Database document id"),
});

export const ListCommentsParamsSchema = z.object({
  documentId: z.string().min(1).max(21).describe("Document id"),
});

export const CreateDocumentParamsSchema = z.object({
  title: z.string().min(1).max(500),
  markdown: z
    .string()
    .max(400_000)
    .default("")
    .describe(
      "Headings, paragraphs, bullet/numbered/check lists, quotes, code fences, dividers and GFM tables (| a | b | with a | --- | --- | row under the header)"
    ),
  ownerEmail: z
    .string()
    .email()
    .describe("Email of the Leaf user who will own the document"),
  parentId: z
    .string()
    .min(1)
    .max(21)
    .optional()
    .describe("Optional parent page id (the new page inherits org/teamspace)"),
});

export const UpdateDocumentParamsSchema = z.object({
  documentId: z.string().min(1).max(21),
  markdown: z
    .string()
    .min(1)
    .max(400_000)
    .describe(
      "Headings, paragraphs, bullet/numbered/check lists, quotes, code fences, dividers and GFM tables (| a | b | with a | --- | --- | row under the header)"
    ),
  mode: z
    .enum(["replace", "append"])
    .default("append")
    .describe("replace rewrites the whole body; append adds to the end"),
  authorEmail: z
    .string()
    .email()
    .describe("Email of the Leaf user recorded in the version history"),
});

export const InviteLinkParamsSchema = z.object({
  orgId: z.string().min(1).max(21),
  action: z
    .enum(["get", "enable", "reset", "disable"])
    .describe(
      "get reads the current link; enable creates one if missing; reset revokes the old link and creates a new one; disable revokes it"
    ),
});

export type SearchDocumentsParams = z.infer<typeof SearchDocumentsParamsSchema>;
export type GetDocumentParams = z.infer<typeof GetDocumentParamsSchema>;
export type ListDocumentsParams = z.infer<typeof ListDocumentsParamsSchema>;
export type GetDatabaseParams = z.infer<typeof GetDatabaseParamsSchema>;
export type ListCommentsParams = z.infer<typeof ListCommentsParamsSchema>;
export type CreateDocumentParams = z.infer<typeof CreateDocumentParamsSchema>;
export type UpdateDocumentParams = z.infer<typeof UpdateDocumentParamsSchema>;
export type InviteLinkParams = z.infer<typeof InviteLinkParamsSchema>;

export interface McpToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  [key: string]: unknown;
}

export class LeafMCPError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "LeafMCPError";
  }
}
