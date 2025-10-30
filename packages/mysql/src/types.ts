import { z } from "zod";

export const MySQLConfigSchema = z.object({
  host: z.string(),
  port: z.number().min(1).max(65535).default(3306),
  user: z.string(),
  password: z.string(),
  database: z.string(),
  ssl: z.boolean().optional().default(false),
  connectionTimeout: z.number().optional().default(30000),
});

export type MySQLConfig = z.output<typeof MySQLConfigSchema>;
export type MySQLConfigInput = z.input<typeof MySQLConfigSchema>;

export const ReadQueryParamsSchema = z.object({
  query: z.string().min(1),
});

export type ReadQueryParams = z.infer<typeof ReadQueryParamsSchema>;

export const DescribeTableParamsSchema = z.object({
  tableName: z.string().min(1),
});

export type DescribeTableParams = z.infer<typeof DescribeTableParamsSchema>;

export interface TableInfo {
  TABLE_NAME: string;
  TABLE_TYPE: string;
  TABLE_SCHEMA: string;
}

export interface ColumnInfo {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_DEFAULT: string | null;
  COLUMN_KEY: string;
  EXTRA: string;
  COLUMN_COMMENT: string;
}

export interface DatabaseInfo {
  Database: string;
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

export class MySQLMCPError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly sqlState?: string
  ) {
    super(message);
    this.name = "MySQLMCPError";
  }
}
