import { z } from "zod";

export const PostgreSQLConfigSchema = z.object({
  host: z.string(),
  port: z.number().min(1).max(65535).default(5432),
  user: z.string(),
  password: z.string(),
  database: z.string(),
  ssl: z.boolean().optional().default(false),
  connectionTimeout: z.number().optional().default(30000),
});

export type PostgreSQLConfig = z.output<typeof PostgreSQLConfigSchema>;
export type PostgreSQLConfigInput = z.input<typeof PostgreSQLConfigSchema>;

export const ReadQueryParamsSchema = z.object({
  query: z.string().min(1),
});

export type ReadQueryParams = z.infer<typeof ReadQueryParamsSchema>;

export const DescribeTableParamsSchema = z.object({
  tableName: z.string().min(1),
  schemaName: z.string().optional().default("public"),
});

export type DescribeTableParams = z.infer<typeof DescribeTableParamsSchema>;

export interface TableInfo {
  table_name: string;
  table_type: string;
  table_schema: string;
}

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  constraint_type: string | null;
  character_maximum_length: number | null;
}

export interface DatabaseInfo {
  datname: string;
}

export interface SchemaInfo {
  schema_name: string;
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

export class PostgreSQLMCPError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly detail?: string
  ) {
    super(message);
    this.name = "PostgreSQLMCPError";
  }
}
