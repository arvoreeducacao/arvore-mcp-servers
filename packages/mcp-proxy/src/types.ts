import { z } from "zod";

export const UpstreamAuthSchema = z.object({
  apiKey: z.string().optional(),
  scopes: z.array(z.string()).optional(),
});

export type UpstreamAuth = z.infer<typeof UpstreamAuthSchema>;

export const UpstreamServerConfigSchema = z.object({
  name: z.string().min(1),
  transport: z.enum(["stdio", "http"]).default("stdio"),

  command: z.string().optional(),
  args: z.array(z.string()).default([]),

  url: z.string().optional(),
  auth: UpstreamAuthSchema.optional(),

  env: z.record(z.string()).default({}),
});

export type UpstreamServerConfig = z.infer<typeof UpstreamServerConfigSchema>;

export const ProxyConfigSchema = z.object({
  upstreams: z.array(UpstreamServerConfigSchema).min(1),
  searchLimit: z.number().min(1).max(20).default(5),
  callItemLimit: z.number().min(1).max(100).default(20),
  maxTextLength: z.number().min(50).max(5000).default(500),
  maxOutputTokens: z.number().min(1000).max(32000).default(8000),
});

export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;

export interface RegistryEntry {
  ref: string;
  provider: string;
  originalName: string;
  title: string;
  description: string;
  mainParams: string[];
  example: Record<string, unknown>;
  tags: string[];
  embedding?: number[];
  _inputSchema: Record<string, unknown>;
}

export const SearchParamsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(20).optional(),
});

export type SearchParams = z.infer<typeof SearchParamsSchema>;

export interface SearchResult {
  ref: string;
  title: string;
  hint: string;
}

export interface SchemaResult {
  ref: string;
  title: string;
  description: string;
  params: Record<string, unknown>;
  required: string[];
  example: Record<string, unknown>;
}

export const SchemaParamsSchema = z.object({
  ref: z.string().min(1),
});

export const CallParamsSchema = z.object({
  ref: z.string().min(1),
  args: z.record(z.unknown()).default({}),
  page_cursor: z.string().optional(),
  detail: z.boolean().optional(),
});

export type CallParams = z.infer<typeof CallParamsSchema>;

export interface CallResult {
  items?: Shaped[];
  data?: unknown;
  next_cursor: string | null;
  meta?: Record<string, unknown>;
}

export interface Shaped {
  ref: string;
  [key: string]: unknown;
}

export interface PaginationState {
  ref: string;
  args: Record<string, unknown>;
  provider: string;
  originalName: string;
  page: number;
  upstreamCursor?: unknown;
  createdAt: number;
}

export interface AuditEntry {
  timestamp: string;
  tool: string;
  provider: string;
  args: Record<string, unknown>;
  outputSize: number;
  executionTimeMs: number;
  itemCount?: number;
  error?: string;
}

export interface McpToolResult {
  [x: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class ProxyError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "ProxyError";
  }
}
