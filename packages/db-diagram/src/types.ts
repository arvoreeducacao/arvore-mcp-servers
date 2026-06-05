import { z } from "zod";

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  defaultValue?: string;
}

export interface ForeignKey {
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
}

export interface Table {
  name: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
}

export interface Schema {
  tables: Table[];
}

export const GenerateErdParamsSchema = z.object({
  ddl: z.string().min(1).describe("SQL DDL statements (CREATE TABLE)"),
  tables: z
    .array(z.string())
    .optional()
    .describe("Filter to specific tables (omit for all)"),
  title: z.string().optional().describe("Diagram title"),
});

export type GenerateErdParams = z.infer<typeof GenerateErdParamsSchema>;

export const GenerateDomainMapParamsSchema = z.object({
  ddl: z.string().min(1).describe("SQL DDL statements (CREATE TABLE)"),
  entryTable: z
    .string()
    .describe("Starting table to trace relationships from"),
  depth: z
    .number()
    .min(1)
    .max(10)
    .default(3)
    .describe("How many relationship hops to follow (default: 3)"),
});

export type GenerateDomainMapParams = z.infer<
  typeof GenerateDomainMapParamsSchema
>;

export const ExplainTableParamsSchema = z.object({
  ddl: z.string().min(1).describe("SQL DDL statements (CREATE TABLE)"),
  table: z.string().describe("Table name to explain"),
});

export type ExplainTableParams = z.infer<typeof ExplainTableParamsSchema>;

export const TraceFlowParamsSchema = z.object({
  ddl: z.string().min(1).describe("SQL DDL statements (CREATE TABLE)"),
  from: z.string().describe("Source table"),
  to: z.string().describe("Target table"),
});

export type TraceFlowParams = z.infer<typeof TraceFlowParamsSchema>;

export const VisualizeParamsSchema = z.object({
  ddl: z.string().optional().describe("SQL DDL statements (CREATE TABLE). Provide either ddl or mermaid."),
  mermaid: z.string().optional().describe("Raw Mermaid diagram code to render directly."),
  tables: z.array(z.string()).optional().describe("Filter to specific tables (only when using ddl)"),
  title: z.string().optional().describe("Diagram title"),
});

export type VisualizeParams = z.infer<typeof VisualizeParamsSchema>;



export interface McpToolResult {
  [x: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}
