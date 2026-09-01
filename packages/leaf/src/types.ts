import { z } from "zod";

export const LeafConfigSchema = z.object({
  databaseUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("mysql://"), {
      message: "LEAF_DATABASE_URL must be a mysql:// URL",
    }),
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

export type SearchDocumentsParams = z.infer<typeof SearchDocumentsParamsSchema>;
export type GetDocumentParams = z.infer<typeof GetDocumentParamsSchema>;
export type ListDocumentsParams = z.infer<typeof ListDocumentsParamsSchema>;
export type GetDatabaseParams = z.infer<typeof GetDatabaseParamsSchema>;
export type ListCommentsParams = z.infer<typeof ListCommentsParamsSchema>;

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
