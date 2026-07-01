import { z } from "zod";

export const ClientHubConfigSchema = z.object({
  apiBaseUrl: z.string().url(),
  apiToken: z.string().optional().default(""),
  requestTimeout: z.number().optional().default(30000),
});

export type ClientHubConfig = z.output<typeof ClientHubConfigSchema>;
export type ClientHubConfigInput = z.input<typeof ClientHubConfigSchema>;

export const SearchClientParamsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

export type SearchClientParams = z.infer<typeof SearchClientParamsSchema>;

export const GetClient360ParamsSchema = z.object({
  clientId: z.number().int().positive(),
});

export type GetClient360Params = z.infer<typeof GetClient360ParamsSchema>;

export const SearchConversationsParamsSchema = z.object({
  clientId: z.number().int().positive(),
  query: z.string().min(1),
  source: z
    .string()
    .optional()
    .describe("Filter by source: 'whatsapp' or 'elephan'. Omit to search all sources."),
  limit: z.number().int().positive().optional(),
});

export type SearchConversationsParams = z.infer<
  typeof SearchConversationsParamsSchema
>;

export const ListLinksParamsSchema = z.object({
  clientId: z.number().int().positive(),
});

export type ListLinksParams = z.infer<typeof ListLinksParamsSchema>;

export interface McpToolResult {
  [x: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class ClientHubMCPError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly detail?: string
  ) {
    super(message);
    this.name = "ClientHubMCPError";
  }
}
