import { z } from "zod";

export const ClickHouseConfigSchema = z.object({
  url: z.string().url(),
  username: z.string().default("default"),
  password: z.string().default(""),
  database: z.string().default("default"),
  requestTimeout: z.number().optional().default(30000),
});

export type ClickHouseConfig = z.output<typeof ClickHouseConfigSchema>;
export type ClickHouseConfigInput = z.input<typeof ClickHouseConfigSchema>;

export const ReadQueryParamsSchema = z.object({
  query: z.string().min(1),
});

export type ReadQueryParams = z.infer<typeof ReadQueryParamsSchema>;

export const DescribeTableParamsSchema = z.object({
  tableName: z.string().min(1),
  database: z.string().optional(),
});

export type DescribeTableParams = z.infer<typeof DescribeTableParamsSchema>;

export interface TableInfo {
  name: string;
  engine: string;
  total_rows: string;
  total_bytes: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  default_kind: string;
  default_expression: string;
  is_in_primary_key: number;
  is_in_sorting_key: number;
}

export interface DatabaseInfo {
  name: string;
  engine: string;
}

export interface QueryResult {
  data: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

export interface McpToolResult {
  [x: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class ClickHouseMCPError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly detail?: string
  ) {
    super(message);
    this.name = "ClickHouseMCPError";
  }
}
