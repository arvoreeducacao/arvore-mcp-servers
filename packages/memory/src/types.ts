import { z } from "zod";

export const VALID_CATEGORIES = [
  "decisions",
  "conventions",
  "incidents",
  "domain",
  "gotchas",
] as const;

export const VALID_STATUSES = ["active", "superseded", "archived"] as const;

export type MemoryCategory = (typeof VALID_CATEGORIES)[number];
export type MemoryStatus = (typeof VALID_STATUSES)[number];

export interface MemoryFrontmatter {
  title: string;
  category: MemoryCategory;
  date: string;
  author?: string;
  tags?: string[];
  status?: MemoryStatus;
}

export interface MemoryEntry {
  id: string;
  path: string;
  title: string;
  category: MemoryCategory;
  date: string;
  author?: string;
  tags: string[];
  status: MemoryStatus;
  content: string;
}

export interface MemoryCatalogEntry {
  id: string;
  title: string;
  category: MemoryCategory;
  date: string;
  author?: string;
  tags: string[];
  status: MemoryStatus;
  snippet: string;
}

export const SearchMemoriesParamsSchema = z.object({
  query: z.string().min(1, "Search query is required"),
  category: z.enum(VALID_CATEGORIES).optional(),
  status: z.enum(VALID_STATUSES).optional().default("active"),
  limit: z.number().int().positive().max(50).optional().default(10),
});

export const GetMemoryParamsSchema = z.object({
  id: z.string().min(1, "Memory ID is required"),
});

export const AddMemoryParamsSchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.enum(VALID_CATEGORIES),
  content: z.string().min(1, "Content is required"),
  tags: z.array(z.string()).optional().default([]),
  author: z.string().optional(),
});

export const ListMemoriesParamsSchema = z.object({
  category: z.enum(VALID_CATEGORIES).optional(),
  status: z.enum(VALID_STATUSES).optional(),
  limit: z.number().int().positive().max(100).optional().default(50),
});

export const RemoveMemoryParamsSchema = z.object({
  id: z.string().min(1, "Memory ID is required"),
});

export const ArchiveMemoryParamsSchema = z.object({
  id: z.string().min(1, "Memory ID is required"),
});

export type SearchMemoriesParams = z.infer<typeof SearchMemoriesParamsSchema>;
export type GetMemoryParams = z.infer<typeof GetMemoryParamsSchema>;
export type AddMemoryParams = z.infer<typeof AddMemoryParamsSchema>;
export type ListMemoriesParams = z.infer<typeof ListMemoriesParamsSchema>;
export type RemoveMemoryParams = z.infer<typeof RemoveMemoryParamsSchema>;
export type ArchiveMemoryParams = z.infer<typeof ArchiveMemoryParamsSchema>;

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class MemoryMCPError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "MemoryMCPError";
  }
}
