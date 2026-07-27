import { z } from "zod";

export class GoogleSlidesMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "GoogleSlidesMCPError";
  }
}

export interface GoogleSlidesClientConfig {
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

export const THUMBNAIL_SIZES = ["SMALL", "MEDIUM", "LARGE"] as const;

export const PREDEFINED_LAYOUTS = [
  "BLANK",
  "CAPTION_ONLY",
  "TITLE",
  "TITLE_AND_BODY",
  "TITLE_AND_TWO_COLUMNS",
  "TITLE_ONLY",
  "SECTION_HEADER",
  "SECTION_TITLE_AND_DESCRIPTION",
  "ONE_COLUMN_TEXT",
  "MAIN_POINT",
  "BIG_NUMBER",
] as const;

export const ListPresentationsParamsSchema = z.object({
  nameContains: z
    .string()
    .optional()
    .describe("Filter presentations whose name contains this text"),
  folderId: z
    .string()
    .optional()
    .describe("Only list presentations inside this Drive folder id"),
  limit: z.number().int().min(1).max(100).default(20),
  includeSharedDrives: z.boolean().default(true),
});

export const CreatePresentationParamsSchema = z.object({
  title: z.string().describe("Title of the new presentation"),
  folderId: z
    .string()
    .optional()
    .describe("Drive folder id to move the new presentation into"),
});

export const CopyPresentationParamsSchema = z.object({
  presentationId: z
    .string()
    .describe("Id of the presentation (or template) to copy"),
  title: z.string().describe("Title of the copy"),
  folderId: z.string().optional().describe("Drive folder id for the copy"),
});

export const GetPresentationParamsSchema = z.object({
  presentationId: z.string(),
  fields: z
    .string()
    .optional()
    .describe(
      "Partial-response field mask, e.g. 'presentationId,slides.objectId,slides.pageElements.shape.text'. Omit for the full (large) payload"
    ),
});

export const GetPageParamsSchema = z.object({
  presentationId: z.string(),
  pageObjectId: z
    .string()
    .optional()
    .describe("Object id of the page. Omit and use slideIndex instead"),
  slideIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Zero-based slide index, resolved to its object id"),
});

export const SummarizePresentationParamsSchema = z.object({
  presentationId: z.string(),
  includeNotes: z.boolean().default(true),
  includeObjectIds: z
    .boolean()
    .default(true)
    .describe("Include object ids of every text element, needed to edit them"),
});

export const GetSlideImageParamsSchema = z.object({
  presentationId: z.string(),
  pageObjectId: z.string().optional(),
  slideIndex: z.number().int().min(0).optional(),
  size: z.enum(THUMBNAIL_SIZES).default("MEDIUM"),
});

export const BatchUpdateParamsSchema = z.object({
  presentationId: z.string(),
  requests: z
    .array(z.record(z.unknown()))
    .min(1)
    .describe(
      "Array of raw Slides API Request objects (createShape, insertText, updateTextStyle, updatePageElementTransform, duplicateObject, updateSlidesPosition, createTable, updateShapeProperties, ...)"
    ),
});

export const AddSlideParamsSchema = z.object({
  presentationId: z.string(),
  layout: z.enum(PREDEFINED_LAYOUTS).default("TITLE_AND_BODY"),
  insertionIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Zero-based position for the new slide. Defaults to the end"),
  title: z.string().optional().describe("Text for the TITLE/CENTERED_TITLE placeholder"),
  subtitle: z.string().optional().describe("Text for the SUBTITLE placeholder"),
  body: z
    .string()
    .optional()
    .describe("Text for the BODY placeholder. Use \\n for bullet lines"),
});

export const InsertTextParamsSchema = z.object({
  presentationId: z.string(),
  objectId: z.string().describe("Shape or table cell object id"),
  text: z.string(),
  insertionIndex: z.number().int().min(0).default(0),
  replaceExisting: z
    .boolean()
    .default(false)
    .describe("Delete the current text of the shape before inserting"),
});

export const ReplaceAllTextParamsSchema = z.object({
  presentationId: z.string(),
  replacements: z
    .array(
      z.object({
        find: z.string(),
        replace: z.string(),
        matchCase: z.boolean().default(true),
      })
    )
    .min(1),
  pageObjectIds: z
    .array(z.string())
    .optional()
    .describe("Restrict the replacement to these pages"),
});

export const InsertImageParamsSchema = z.object({
  presentationId: z.string(),
  pageObjectId: z.string().optional(),
  slideIndex: z.number().int().min(0).optional(),
  imageUrl: z
    .string()
    .describe("Publicly reachable image URL (max 50MB, PNG/JPEG/GIF)"),
  widthPt: z.number().positive().optional(),
  heightPt: z.number().positive().optional(),
  xPt: z.number().default(0),
  yPt: z.number().default(0),
});

export const DeleteObjectParamsSchema = z.object({
  presentationId: z.string(),
  objectId: z
    .string()
    .describe("Object id to delete: a page element, a slide, or a table row"),
});

export const SetSpeakerNotesParamsSchema = z.object({
  presentationId: z.string(),
  pageObjectId: z.string().optional(),
  slideIndex: z.number().int().min(0).optional(),
  text: z.string(),
});

export const ExportPresentationParamsSchema = z.object({
  presentationId: z.string(),
  format: z.enum(["pdf", "pptx", "txt"]).default("pdf"),
  destinationPath: z
    .string()
    .optional()
    .describe(
      "Absolute local path to write the export to. Only useful when the server runs locally over stdio"
    ),
});

export type ListPresentationsParams = z.infer<typeof ListPresentationsParamsSchema>;
export type CreatePresentationParams = z.infer<typeof CreatePresentationParamsSchema>;
export type CopyPresentationParams = z.infer<typeof CopyPresentationParamsSchema>;
export type GetPresentationParams = z.infer<typeof GetPresentationParamsSchema>;
export type GetPageParams = z.infer<typeof GetPageParamsSchema>;
export type SummarizePresentationParams = z.infer<
  typeof SummarizePresentationParamsSchema
>;
export type GetSlideImageParams = z.infer<typeof GetSlideImageParamsSchema>;
export type BatchUpdateParams = z.infer<typeof BatchUpdateParamsSchema>;
export type AddSlideParams = z.infer<typeof AddSlideParamsSchema>;
export type InsertTextParams = z.infer<typeof InsertTextParamsSchema>;
export type ReplaceAllTextParams = z.infer<typeof ReplaceAllTextParamsSchema>;
export type InsertImageParams = z.infer<typeof InsertImageParamsSchema>;
export type DeleteObjectParams = z.infer<typeof DeleteObjectParamsSchema>;
export type SetSpeakerNotesParams = z.infer<typeof SetSpeakerNotesParamsSchema>;
export type ExportPresentationParams = z.infer<typeof ExportPresentationParamsSchema>;

export interface TextRun {
  content?: string;
}

export interface TextElement {
  textRun?: TextRun;
  paragraphMarker?: unknown;
}

export interface Shape {
  text?: { textElements?: TextElement[] };
  placeholder?: { type?: string; index?: number };
  shapeType?: string;
}

export interface PageElement {
  objectId: string;
  shape?: Shape;
  table?: {
    rows?: number;
    columns?: number;
    tableRows?: { tableCells?: { text?: { textElements?: TextElement[] } }[] }[];
  };
  image?: { contentUrl?: string; sourceUrl?: string };
  elementGroup?: { children?: PageElement[] };
  title?: string;
  description?: string;
}

export interface Page {
  objectId: string;
  pageType?: string;
  pageElements?: PageElement[];
  slideProperties?: {
    notesPage?: {
      objectId?: string;
      notesProperties?: { speakerNotesObjectId?: string };
      pageElements?: PageElement[];
    };
    layoutObjectId?: string;
  };
}

export interface Presentation {
  presentationId: string;
  title?: string;
  slides?: Page[];
  layouts?: Page[];
  masters?: Page[];
  pageSize?: { width?: { magnitude?: number }; height?: { magnitude?: number } };
  revisionId?: string;
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
