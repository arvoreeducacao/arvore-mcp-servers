import { z } from "zod";

export class GoogleDocsMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "GoogleDocsMCPError";
  }
}

export interface GoogleDocsClientConfig {
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

export const NAMED_STYLES = [
  "NORMAL_TEXT",
  "TITLE",
  "SUBTITLE",
  "HEADING_1",
  "HEADING_2",
  "HEADING_3",
  "HEADING_4",
  "HEADING_5",
  "HEADING_6",
] as const;

export const ALIGNMENTS = ["START", "CENTER", "END", "JUSTIFIED"] as const;

export const BULLET_PRESETS = [
  "BULLET_DISC_CIRCLE_SQUARE",
  "BULLET_ARROW_DIAMOND_DISC",
  "BULLET_CHECKBOX",
  "NUMBERED_DECIMAL_ALPHA_ROMAN",
  "NUMBERED_DECIMAL_NESTED",
] as const;

export const EXPORT_FORMATS = [
  "pdf",
  "docx",
  "txt",
  "md",
  "html",
  "odt",
  "rtf",
  "epub",
] as const;

export const ListDocumentsParamsSchema = z.object({
  nameContains: z
    .string()
    .optional()
    .describe("Filter documents whose name contains this text"),
  folderId: z.string().optional().describe("Only list documents inside this Drive folder id"),
  limit: z.number().int().min(1).max(100).default(20),
  includeSharedDrives: z.boolean().default(true),
});

export const CreateDocumentParamsSchema = z.object({
  title: z.string().describe("Title of the new document"),
  folderId: z.string().optional().describe("Drive folder id to move the new document into"),
});

export const CreateDocumentFromMarkdownParamsSchema = z.object({
  title: z.string().describe("Title of the new document"),
  markdown: z
    .string()
    .describe(
      "Markdown source. Google converts it on import: # headings, **bold**, *italic*, lists, tables, links and code blocks all survive"
    ),
  folderId: z.string().optional().describe("Drive folder id for the new document"),
});

export const OverwriteDocumentFromMarkdownParamsSchema = z.object({
  documentId: z.string(),
  markdown: z.string().describe("Markdown that becomes the entire new content of the document"),
});

export const CopyDocumentParamsSchema = z.object({
  documentId: z.string().describe("Id of the document (or template) to copy"),
  title: z.string().describe("Title of the copy"),
  folderId: z.string().optional().describe("Drive folder id for the copy"),
});

export const ReadDocumentParamsSchema = z.object({
  documentId: z.string(),
  maxCharacters: z
    .number()
    .int()
    .min(1000)
    .max(400_000)
    .default(120_000)
    .describe("Truncate the returned markdown at this many characters"),
});

export const OutlineDocumentParamsSchema = z.object({
  documentId: z.string(),
  includeTables: z.boolean().default(true),
  includeText: z
    .boolean()
    .default(true)
    .describe("Include the text of each block. Turn off for a cheap map of the structure"),
});

export const GetDocumentParamsSchema = z.object({
  documentId: z.string(),
  fields: z
    .string()
    .optional()
    .describe(
      "Partial-response field mask, e.g. 'documentId,title,body.content.paragraph.elements.textRun.content'. Omit for the full (large) payload"
    ),
});

export const InsertTextParamsSchema = z.object({
  documentId: z.string(),
  text: z.string(),
  index: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Body index to insert at, from outline_document. Omit to append to the end"),
  segmentId: z
    .string()
    .optional()
    .describe("Header/footer/footnote segment id. Omit for the document body"),
});

export const AppendParagraphsParamsSchema = z.object({
  documentId: z.string(),
  paragraphs: z
    .array(
      z.object({
        text: z.string(),
        style: z.enum(NAMED_STYLES).default("NORMAL_TEXT"),
        bulleted: z.boolean().default(false),
      })
    )
    .min(1)
    .describe("Paragraphs appended to the end of the document, in order"),
});

export const ReplaceAllTextParamsSchema = z.object({
  documentId: z.string(),
  replacements: z
    .array(
      z.object({
        find: z.string(),
        replace: z.string(),
        matchCase: z.boolean().default(true),
      })
    )
    .min(1),
});

export const DeleteRangeParamsSchema = z.object({
  documentId: z.string(),
  startIndex: z.number().int().min(1),
  endIndex: z.number().int().min(2),
  segmentId: z.string().optional(),
});

export const FormatTextParamsSchema = z.object({
  documentId: z.string(),
  startIndex: z.number().int().min(1),
  endIndex: z.number().int().min(2),
  segmentId: z.string().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
  fontSizePt: z.number().positive().optional(),
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
    .describe("Highlight color as a hex triplet"),
  linkUrl: z.string().url().optional().describe("Turn the range into a link"),
});

export const FormatParagraphParamsSchema = z.object({
  documentId: z.string(),
  startIndex: z.number().int().min(1),
  endIndex: z.number().int().min(2),
  segmentId: z.string().optional(),
  style: z.enum(NAMED_STYLES).optional(),
  alignment: z.enum(ALIGNMENTS).optional(),
  indentStartPt: z.number().min(0).optional(),
  spaceAbovePt: z.number().min(0).optional(),
  spaceBelowPt: z.number().min(0).optional(),
  bullets: z
    .enum(BULLET_PRESETS)
    .optional()
    .describe("Turn the paragraphs in the range into a list with this preset"),
  removeBullets: z.boolean().default(false),
});

export const InsertTableParamsSchema = z.object({
  documentId: z.string(),
  rows: z.number().int().min(1).max(100),
  columns: z.number().int().min(1).max(20),
  index: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Body index to insert at. Omit to append to the end"),
  values: z
    .array(z.array(z.string()))
    .optional()
    .describe("Row-major cell texts, filled after the table is created"),
});

export const InsertImageParamsSchema = z.object({
  documentId: z.string(),
  imageUrl: z.string().url().describe("Publicly reachable image URL (max 50MB, PNG/JPEG/GIF)"),
  index: z.number().int().min(1).optional().describe("Body index. Omit to append to the end"),
  widthPt: z.number().positive().optional(),
  heightPt: z.number().positive().optional(),
});

export const InsertPageBreakParamsSchema = z.object({
  documentId: z.string(),
  index: z.number().int().min(1).optional(),
});

export const BatchUpdateParamsSchema = z.object({
  documentId: z.string(),
  requests: z
    .array(z.record(z.unknown()))
    .min(1)
    .describe(
      "Array of raw Docs API Request objects (insertText, deleteContentRange, updateTextStyle, updateParagraphStyle, insertTable, insertTableRow, createHeader, createFooter, updateDocumentStyle, ...)"
    ),
});

export const ExportDocumentParamsSchema = z.object({
  documentId: z.string(),
  format: z.enum(EXPORT_FORMATS).default("pdf"),
  destinationPath: z
    .string()
    .optional()
    .describe(
      "Absolute local path to write the export to. Only useful when the server runs locally over stdio"
    ),
});

export type ListDocumentsParams = z.infer<typeof ListDocumentsParamsSchema>;
export type CreateDocumentParams = z.infer<typeof CreateDocumentParamsSchema>;
export type CreateDocumentFromMarkdownParams = z.infer<
  typeof CreateDocumentFromMarkdownParamsSchema
>;
export type OverwriteDocumentFromMarkdownParams = z.infer<
  typeof OverwriteDocumentFromMarkdownParamsSchema
>;
export type CopyDocumentParams = z.infer<typeof CopyDocumentParamsSchema>;
export type ReadDocumentParams = z.infer<typeof ReadDocumentParamsSchema>;
export type OutlineDocumentParams = z.infer<typeof OutlineDocumentParamsSchema>;
export type GetDocumentParams = z.infer<typeof GetDocumentParamsSchema>;
export type InsertTextParams = z.infer<typeof InsertTextParamsSchema>;
export type AppendParagraphsParams = z.infer<typeof AppendParagraphsParamsSchema>;
export type ReplaceAllTextParams = z.infer<typeof ReplaceAllTextParamsSchema>;
export type DeleteRangeParams = z.infer<typeof DeleteRangeParamsSchema>;
export type FormatTextParams = z.infer<typeof FormatTextParamsSchema>;
export type FormatParagraphParams = z.infer<typeof FormatParagraphParamsSchema>;
export type InsertTableParams = z.infer<typeof InsertTableParamsSchema>;
export type InsertImageParams = z.infer<typeof InsertImageParamsSchema>;
export type InsertPageBreakParams = z.infer<typeof InsertPageBreakParamsSchema>;
export type BatchUpdateParams = z.infer<typeof BatchUpdateParamsSchema>;
export type ExportDocumentParams = z.infer<typeof ExportDocumentParamsSchema>;

export interface TextRun {
  content?: string;
  textStyle?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    link?: { url?: string };
  };
}

export interface ParagraphElement {
  startIndex?: number;
  endIndex?: number;
  textRun?: TextRun;
  inlineObjectElement?: { inlineObjectId?: string };
  pageBreak?: unknown;
  horizontalRule?: unknown;
  footnoteReference?: { footnoteId?: string; footnoteNumber?: string };
}

export interface Paragraph {
  elements?: ParagraphElement[];
  paragraphStyle?: { namedStyleType?: string; alignment?: string };
  bullet?: { listId?: string; nestingLevel?: number };
}

export interface TableCell {
  startIndex?: number;
  endIndex?: number;
  content?: StructuralElement[];
}

export interface TableRow {
  startIndex?: number;
  endIndex?: number;
  tableCells?: TableCell[];
}

export interface Table {
  rows?: number;
  columns?: number;
  tableRows?: TableRow[];
}

export interface StructuralElement {
  startIndex?: number;
  endIndex?: number;
  paragraph?: Paragraph;
  table?: Table;
  sectionBreak?: unknown;
  tableOfContents?: { content?: StructuralElement[] };
}

export interface Document {
  documentId: string;
  title?: string;
  revisionId?: string;
  body?: { content?: StructuralElement[] };
  headers?: Record<string, { content?: StructuralElement[] }>;
  footers?: Record<string, { content?: StructuralElement[] }>;
  inlineObjects?: Record<string, unknown>;
  namedRanges?: Record<string, unknown>;
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
