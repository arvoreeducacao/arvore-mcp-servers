import { z } from "zod";

export class GoogleSheetsMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "GoogleSheetsMCPError";
  }
}

export interface GoogleSheetsClientConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export interface OAuthCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  token_type: string;
}

export const VALUE_INPUT_OPTIONS = ["USER_ENTERED", "RAW"] as const;
export const VALUE_RENDER_OPTIONS = ["FORMATTED_VALUE", "UNFORMATTED_VALUE", "FORMULA"] as const;
export const DIMENSIONS = ["ROWS", "COLUMNS"] as const;
export const HORIZONTAL_ALIGNMENTS = ["LEFT", "CENTER", "RIGHT"] as const;
export const VERTICAL_ALIGNMENTS = ["TOP", "MIDDLE", "BOTTOM"] as const;
export const WRAP_STRATEGIES = ["OVERFLOW_CELL", "CLIP", "WRAP"] as const;
export const NUMBER_FORMAT_TYPES = [
  "TEXT",
  "NUMBER",
  "PERCENT",
  "CURRENCY",
  "DATE",
  "TIME",
  "DATE_TIME",
  "SCIENTIFIC",
] as const;

export const ListSpreadsheetsParamsSchema = z.object({
  nameContains: z.string().optional().describe("Filter spreadsheets whose name contains this text"),
  folderId: z.string().optional().describe("Only list spreadsheets inside this Drive folder id"),
  limit: z.number().int().min(1).max(100).default(20),
  includeSharedDrives: z.boolean().default(true),
});

export const CreateSpreadsheetParamsSchema = z.object({
  title: z.string().describe("Title of the new spreadsheet"),
  sheetTitles: z
    .array(z.string())
    .optional()
    .describe("Titles of the tabs to create. Defaults to a single 'Sheet1'"),
  folderId: z.string().optional().describe("Drive folder id to move the new spreadsheet into"),
});

export const CopySpreadsheetParamsSchema = z.object({
  spreadsheetId: z.string().describe("Id of the spreadsheet (or template) to copy"),
  title: z.string().describe("Title of the copy"),
  folderId: z.string().optional().describe("Drive folder id for the copy"),
});

export const DescribeSpreadsheetParamsSchema = z.object({
  spreadsheetId: z.string(),
  previewRows: z
    .number()
    .int()
    .min(0)
    .max(50)
    .default(5)
    .describe("Rows of each tab to preview. 0 for structure only"),
});

export const ReadRangeParamsSchema = z.object({
  spreadsheetId: z.string(),
  ranges: z
    .array(z.string())
    .min(1)
    .describe("A1 ranges, e.g. ['Sheet1!A1:D50', 'Resumo!A:B']. A bare tab name reads the whole tab"),
  valueRender: z.enum(VALUE_RENDER_OPTIONS).default("FORMATTED_VALUE"),
  majorDimension: z.enum(DIMENSIONS).default("ROWS"),
});

export const WriteRangeParamsSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string().describe("A1 range where the top-left cell of the values lands, e.g. 'Sheet1!A1'"),
  values: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .min(1)
    .describe("Row-major values. Cells beyond the given values are left untouched"),
  valueInput: z
    .enum(VALUE_INPUT_OPTIONS)
    .default("USER_ENTERED")
    .describe("USER_ENTERED parses formulas, dates and numbers like a person typing; RAW stores literally"),
  majorDimension: z.enum(DIMENSIONS).default("ROWS"),
});

export const AppendRowsParamsSchema = z.object({
  spreadsheetId: z.string(),
  range: z
    .string()
    .describe("A1 range that identifies the table to append to, e.g. 'Sheet1!A:D' or just 'Sheet1'"),
  values: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .min(1),
  valueInput: z.enum(VALUE_INPUT_OPTIONS).default("USER_ENTERED"),
  insertRows: z
    .boolean()
    .default(true)
    .describe("Insert new rows instead of overwriting whatever sits below the table"),
});

export const ClearRangeParamsSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string().describe("A1 range to clear. Clears values and keeps formatting"),
});

export const AddSheetParamsSchema = z.object({
  spreadsheetId: z.string(),
  title: z.string(),
  index: z.number().int().min(0).optional().describe("Zero-based tab position. Defaults to the end"),
  rowCount: z.number().int().min(1).max(50_000).default(1000),
  columnCount: z.number().int().min(1).max(1000).default(26),
});

export const DeleteSheetParamsSchema = z.object({
  spreadsheetId: z.string(),
  sheetTitle: z.string().describe("Title of the tab to delete"),
});

export const RenameSheetParamsSchema = z.object({
  spreadsheetId: z.string(),
  sheetTitle: z.string(),
  newTitle: z.string(),
});

export const InsertDimensionParamsSchema = z.object({
  spreadsheetId: z.string(),
  sheetTitle: z.string(),
  dimension: z.enum(DIMENSIONS),
  startIndex: z.number().int().min(0).describe("Zero-based position to insert at"),
  count: z.number().int().min(1).max(1000).default(1),
  inheritFromBefore: z
    .boolean()
    .default(true)
    .describe("Copy formatting from the row/column before the insertion point"),
});

export const DeleteDimensionParamsSchema = z.object({
  spreadsheetId: z.string(),
  sheetTitle: z.string(),
  dimension: z.enum(DIMENSIONS),
  startIndex: z.number().int().min(0).describe("Zero-based first row/column to delete"),
  count: z.number().int().min(1).max(1000).default(1),
});

export const SortRangeParamsSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string().describe("A1 range to sort, excluding the header row"),
  sortBy: z
    .array(
      z.object({
        column: z
          .string()
          .describe(
            "Column letter as it appears in the sheet — absolute, not relative to the range. 'B' is always the second column of the tab"
          ),
        descending: z.boolean().default(false),
      })
    )
    .min(1),
});

export const FormatCellsParamsSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string().describe("A1 range to format"),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
  fontSize: z.number().int().min(6).max(400).optional(),
  fontFamily: z.string().optional(),
  foregroundColor: z
    .string()
    .regex(/^#?[0-9a-fA-F]{6}$/)
    .optional()
    .describe("Text color as a hex triplet, e.g. #1f2937"),
  backgroundColor: z
    .string()
    .regex(/^#?[0-9a-fA-F]{6}$/)
    .optional()
    .describe("Cell fill as a hex triplet"),
  horizontalAlignment: z.enum(HORIZONTAL_ALIGNMENTS).optional(),
  verticalAlignment: z.enum(VERTICAL_ALIGNMENTS).optional(),
  wrapStrategy: z.enum(WRAP_STRATEGIES).optional(),
  numberFormat: z
    .object({
      type: z.enum(NUMBER_FORMAT_TYPES),
      pattern: z
        .string()
        .optional()
        .describe("Pattern such as '#,##0.00', 'R$ #,##0.00' or 'dd/mm/yyyy'"),
    })
    .optional(),
});

export const FindReplaceParamsSchema = z.object({
  spreadsheetId: z.string(),
  find: z.string(),
  replace: z.string(),
  sheetTitle: z.string().optional().describe("Restrict to one tab. Omit to search every tab"),
  matchCase: z.boolean().default(true),
  matchEntireCell: z.boolean().default(false),
  searchByRegex: z.boolean().default(false),
  includeFormulas: z.boolean().default(false),
});

export const BatchUpdateParamsSchema = z.object({
  spreadsheetId: z.string(),
  requests: z
    .array(z.record(z.unknown()))
    .min(1)
    .describe(
      "Array of raw Sheets API Request objects (addChart, mergeCells, addConditionalFormatRule, updateBorders, setDataValidation, addFilterView, autoResizeDimensions, addProtectedRange, ...)"
    ),
});

export const ExportSpreadsheetParamsSchema = z.object({
  spreadsheetId: z.string(),
  format: z.enum(["pdf", "xlsx", "csv"]).default("pdf"),
  sheetTitle: z
    .string()
    .optional()
    .describe("csv only: which tab to render. Defaults to the first one"),
  destinationPath: z
    .string()
    .optional()
    .describe(
      "Absolute local path to write the export to. Only useful when the server runs locally over stdio"
    ),
});

export type ListSpreadsheetsParams = z.infer<typeof ListSpreadsheetsParamsSchema>;
export type CreateSpreadsheetParams = z.infer<typeof CreateSpreadsheetParamsSchema>;
export type CopySpreadsheetParams = z.infer<typeof CopySpreadsheetParamsSchema>;
export type DescribeSpreadsheetParams = z.infer<typeof DescribeSpreadsheetParamsSchema>;
export type ReadRangeParams = z.infer<typeof ReadRangeParamsSchema>;
export type WriteRangeParams = z.infer<typeof WriteRangeParamsSchema>;
export type AppendRowsParams = z.infer<typeof AppendRowsParamsSchema>;
export type ClearRangeParams = z.infer<typeof ClearRangeParamsSchema>;
export type AddSheetParams = z.infer<typeof AddSheetParamsSchema>;
export type DeleteSheetParams = z.infer<typeof DeleteSheetParamsSchema>;
export type RenameSheetParams = z.infer<typeof RenameSheetParamsSchema>;
export type InsertDimensionParams = z.infer<typeof InsertDimensionParamsSchema>;
export type DeleteDimensionParams = z.infer<typeof DeleteDimensionParamsSchema>;
export type SortRangeParams = z.infer<typeof SortRangeParamsSchema>;
export type FormatCellsParams = z.infer<typeof FormatCellsParamsSchema>;
export type FindReplaceParams = z.infer<typeof FindReplaceParamsSchema>;
export type BatchUpdateParams = z.infer<typeof BatchUpdateParamsSchema>;
export type ExportSpreadsheetParams = z.infer<typeof ExportSpreadsheetParamsSchema>;

export type CellValue = string | number | boolean | null;

export interface GridProperties {
  rowCount?: number;
  columnCount?: number;
  frozenRowCount?: number;
  frozenColumnCount?: number;
}

export interface SheetProperties {
  sheetId?: number;
  title?: string;
  index?: number;
  sheetType?: string;
  hidden?: boolean;
  gridProperties?: GridProperties;
}

export interface Sheet {
  properties?: SheetProperties;
}

export interface Spreadsheet {
  spreadsheetId: string;
  properties?: { title?: string; locale?: string; timeZone?: string };
  sheets?: Sheet[];
  namedRanges?: { namedRangeId?: string; name?: string; range?: GridRange }[];
  spreadsheetUrl?: string;
}

export interface GridRange {
  sheetId?: number;
  startRowIndex?: number;
  endRowIndex?: number;
  startColumnIndex?: number;
  endColumnIndex?: number;
}

export interface ValueRange {
  range?: string;
  majorDimension?: string;
  values?: CellValue[][];
}

export interface DriveFile {
  id: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
  modifiedTime?: string;
  owners?: { emailAddress?: string }[];
  parents?: string[];
}

export interface McpToolResult {
  content: (
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  )[];
  isError?: boolean;
  [key: string]: unknown;
}
