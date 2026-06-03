import { z } from "zod";

export const FilesListParamsSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'Drive search query (e.g. "name contains \'invoice\'", "mimeType=\'application/pdf\'", "\'<folderId>\' in parents", "modifiedTime > \'2026-01-01\'"). See https://developers.google.com/drive/api/guides/search-files'
    ),
  folderId: z
    .string()
    .optional()
    .describe(
      "Shortcut for `'<folderId>' in parents`. Combined with `query` if both are provided."
    ),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .default(25)
    .describe("Maximum number of files to return (max 1000)"),
  pageToken: z
    .string()
    .optional()
    .describe("Page token from a previous request for pagination"),
  orderBy: z
    .string()
    .optional()
    .describe(
      'Sort fields: "modifiedTime desc", "name", "createdTime desc", "folder,name", etc.'
    ),
  fields: z
    .string()
    .optional()
    .describe(
      "Custom fields selector (defaults to a sensible set including id, name, mimeType, parents, modifiedTime, owners, webViewLink, size)"
    ),
  includeTrashed: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include trashed files in results"),
});

export const FilesGetParamsSchema = z.object({
  fileId: z.string().min(1).describe("Drive file ID"),
  fields: z
    .string()
    .optional()
    .describe("Custom fields selector. Defaults to all common metadata."),
});

export const FilesDownloadParamsSchema = z.object({
  fileId: z.string().min(1).describe("Drive file ID to download"),
  outputPath: z
    .string()
    .min(1)
    .describe(
      "Absolute local path where the file should be written. Parent directories are created if missing."
    ),
  exportMimeType: z
    .string()
    .optional()
    .describe(
      "Required for Google-native files (Docs/Sheets/Slides) to export. Examples: 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/csv', 'image/png'. Ignored for binary files."
    ),
});

export const FilesUploadParamsSchema = z.object({
  inputPath: z
    .string()
    .min(1)
    .describe("Absolute local path of the file to upload"),
  name: z
    .string()
    .optional()
    .describe(
      "Name for the file in Drive. Defaults to the basename of inputPath."
    ),
  mimeType: z
    .string()
    .optional()
    .describe(
      "MIME type. Inferred from file extension when omitted. Use 'application/vnd.google-apps.folder' to create a folder (without inputPath, use files_create_folder instead)."
    ),
  parentFolderId: z
    .string()
    .optional()
    .describe(
      "ID of the destination folder. Defaults to My Drive root if omitted."
    ),
  description: z.string().optional().describe("Optional file description"),
});

export const FilesUpdateContentParamsSchema = z.object({
  fileId: z.string().min(1).describe("ID of the existing Drive file"),
  inputPath: z
    .string()
    .min(1)
    .describe("Absolute local path of the new file content"),
  mimeType: z
    .string()
    .optional()
    .describe("New MIME type. Defaults to existing MIME type."),
});

export const FilesCreateFolderParamsSchema = z.object({
  name: z.string().min(1).describe("Folder name"),
  parentFolderId: z
    .string()
    .optional()
    .describe(
      "ID of the parent folder. Defaults to My Drive root if omitted."
    ),
});

export const FilesMoveParamsSchema = z.object({
  fileId: z.string().min(1).describe("ID of the file/folder to move"),
  newParentFolderId: z
    .string()
    .optional()
    .describe(
      "New parent folder ID. Required unless you only want to rename via `newName`."
    ),
  newName: z.string().optional().describe("Optional new name (rename)"),
});

export const FilesDeleteParamsSchema = z.object({
  fileId: z.string().min(1).describe("ID of the file/folder to trash"),
  permanent: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "If true, permanently delete (irreversible). Default false moves to trash (recoverable for 30 days)."
    ),
});

export const FilesShareParamsSchema = z.object({
  fileId: z.string().min(1).describe("ID of the file/folder to share"),
  emailAddress: z
    .string()
    .email()
    .optional()
    .describe("Email of the user/group. Omit when type=anyone."),
  role: z
    .enum(["reader", "commenter", "writer", "fileOrganizer", "organizer", "owner"])
    .describe("Permission role"),
  type: z
    .enum(["user", "group", "domain", "anyone"])
    .optional()
    .default("user")
    .describe("Permission type"),
  domain: z
    .string()
    .optional()
    .describe("Required when type=domain (e.g. 'arvore.com.br')"),
  sendNotificationEmail: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to send an email notification"),
  emailMessage: z
    .string()
    .optional()
    .describe("Optional message body for the notification email"),
});

export const ExtractImagesParamsSchema = z.object({
  fileIds: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .describe(
      "List of Drive file IDs of images to extract. Each must be an image MIME type (image/png, image/jpeg, image/gif, image/webp, image/bmp, image/svg+xml). Max 20 per call."
    ),
});

export const AboutGetParamsSchema = z.object({});

export type FilesListParams = z.infer<typeof FilesListParamsSchema>;
export type FilesGetParams = z.infer<typeof FilesGetParamsSchema>;
export type FilesDownloadParams = z.infer<typeof FilesDownloadParamsSchema>;
export type FilesUploadParams = z.infer<typeof FilesUploadParamsSchema>;
export type FilesUpdateContentParams = z.infer<
  typeof FilesUpdateContentParamsSchema
>;
export type FilesCreateFolderParams = z.infer<
  typeof FilesCreateFolderParamsSchema
>;
export type FilesMoveParams = z.infer<typeof FilesMoveParamsSchema>;
export type FilesDeleteParams = z.infer<typeof FilesDeleteParamsSchema>;
export type FilesShareParams = z.infer<typeof FilesShareParamsSchema>;
export type ExtractImagesParams = z.infer<typeof ExtractImagesParamsSchema>;
export type AboutGetParams = z.infer<typeof AboutGetParamsSchema>;

export interface OAuthCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  token_type: string;
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export interface GoogleDriveClientConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  configDir?: string;
  redirectPort?: number;
  supportsAllDrives?: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface DriveFile {
  id?: string;
  name?: string;
  mimeType?: string;
  parents?: string[];
  trashed?: boolean;
  starred?: boolean;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  owners?: Array<{ displayName?: string; emailAddress?: string }>;
  lastModifyingUser?: { displayName?: string; emailAddress?: string };
  shared?: boolean;
  description?: string;
  driveId?: string;
  md5Checksum?: string;
  fileExtension?: string;
}

export interface McpTextContent {
  type: "text";
  text: string;
}

export interface McpImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<McpTextContent | McpImageContent>;
}

export class GoogleDriveMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "GoogleDriveMCPError";
  }
}
