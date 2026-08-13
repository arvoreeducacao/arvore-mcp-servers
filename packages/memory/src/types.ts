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
  updated?: string;
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
  updated?: string;
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
  updated?: string;
  author?: string;
  tags: string[];
  status: MemoryStatus;
  snippet: string;
}

export const ReadMemoriesParamsSchema = z.object({
  id: z
    .string()
    .optional()
    .describe("Read one memory in full. Takes precedence over query."),
  query: z
    .string()
    .optional()
    .describe("Semantic search across the shared memories. Portuguese or English."),
  category: z.enum(VALID_CATEGORIES).optional(),
  tags: z.array(z.string()).optional().describe("Only memories carrying all of these tags."),
  author: z.string().optional().describe("Filter by the email of who wrote the memory."),
  status: z
    .enum(VALID_STATUSES)
    .optional()
    .describe("Defaults to active. Use archived to reach retired memories."),
  limit: z.number().int().positive().max(200).optional().default(30),
});

export const WriteMemoryParamsSchema = z.object({
  action: z
    .enum(["save", "archive", "delete"])
    .optional()
    .default("save")
    .describe("save creates or updates, archive retires, delete removes for good."),
  id: z
    .string()
    .optional()
    .describe("Required for archive and delete. On save, updates that memory instead of creating."),
  title: z.string().optional(),
  category: z.enum(VALID_CATEGORIES).optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(VALID_STATUSES).optional().describe("Only on save with id."),
  force: z
    .boolean()
    .optional()
    .describe("Create even when a near-duplicate memory already exists."),
});

export type ReadMemoriesParams = z.infer<typeof ReadMemoriesParamsSchema>;
export type WriteMemoryParams = z.infer<typeof WriteMemoryParamsSchema>;

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
