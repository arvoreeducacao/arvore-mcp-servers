import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import {
  GoogleDriveClient,
  guessMimeType,
  isImageMimeType,
} from "./client.js";
import {
  AboutGetParams,
  ExtractImagesParams,
  FilesCreateFolderParams,
  FilesDeleteParams,
  FilesDownloadParams,
  FilesGetParams,
  FilesListParams,
  FilesMoveParams,
  FilesShareParams,
  FilesUpdateContentParams,
  FilesUploadParams,
  GoogleDriveMCPError,
  McpImageContent,
  McpTextContent,
  McpToolResult,
} from "./types.js";

export interface GoogleDriveMCPToolsOptions {
  allowShare: boolean;
  allowPermanentDelete: boolean;
}

export class GoogleDriveMCPTools {
  constructor(
    private client: GoogleDriveClient,
    private options: GoogleDriveMCPToolsOptions
  ) {}

  async listFiles(params: FilesListParams): Promise<McpToolResult> {
    try {
      const result = await this.client.listFiles({
        query: params.query,
        folderId: params.folderId,
        pageSize: params.pageSize,
        pageToken: params.pageToken,
        orderBy: params.orderBy,
        fields: params.fields,
        includeTrashed: params.includeTrashed,
      });

      return jsonResult({
        files: result.files,
        nextPageToken: result.nextPageToken || null,
        incompleteSearch: result.incompleteSearch || false,
        count: result.files.length,
      });
    } catch (error) {
      return formatError(error, {
        query: params.query,
        folderId: params.folderId,
      });
    }
  }

  async getFile(params: FilesGetParams): Promise<McpToolResult> {
    try {
      const file = await this.client.getFile(params.fileId, params.fields);
      return jsonResult(file);
    } catch (error) {
      return formatError(error, { fileId: params.fileId });
    }
  }

  async downloadFile(params: FilesDownloadParams): Promise<McpToolResult> {
    if (!isAbsolute(params.outputPath)) {
      return jsonResult({
        error: `outputPath must be an absolute path, got: ${params.outputPath}`,
      });
    }

    try {
      const metadata = await this.client.getFile(
        params.fileId,
        "id,name,mimeType,size"
      );
      const isGoogleDoc = (metadata.mimeType || "").startsWith(
        "application/vnd.google-apps."
      );

      let buffer: Buffer;
      let resolvedMimeType: string;

      if (isGoogleDoc) {
        const exportMime =
          params.exportMimeType || defaultExportMime(metadata.mimeType || "");
        if (!exportMime) {
          return jsonResult({
            error: `File is a Google-native type (${metadata.mimeType}). Pass exportMimeType (e.g. 'application/pdf', 'text/csv').`,
            file: metadata,
          });
        }
        const exported = await this.client.exportFile({
          fileId: params.fileId,
          mimeType: exportMime,
        });
        buffer = exported.buffer;
        resolvedMimeType = exported.mimeType;
      } else {
        const downloaded = await this.client.downloadFile(params.fileId);
        buffer = downloaded.buffer;
        resolvedMimeType = downloaded.mimeType;
      }

      await mkdir(dirname(params.outputPath), { recursive: true });
      await writeFile(params.outputPath, buffer);

      return jsonResult({
        success: true,
        file: {
          id: metadata.id,
          name: metadata.name,
          mimeType: metadata.mimeType,
          downloadedMimeType: resolvedMimeType,
          size_bytes: buffer.length,
        },
        written_to: params.outputPath,
      });
    } catch (error) {
      return formatError(error, {
        fileId: params.fileId,
        outputPath: params.outputPath,
      });
    }
  }

  async uploadFile(params: FilesUploadParams): Promise<McpToolResult> {
    if (!isAbsolute(params.inputPath)) {
      return jsonResult({
        error: `inputPath must be an absolute path, got: ${params.inputPath}`,
      });
    }

    try {
      const file = await this.client.uploadFile({
        inputPath: params.inputPath,
        name: params.name,
        mimeType: params.mimeType,
        parentFolderId: params.parentFolderId,
        description: params.description,
      });

      return jsonResult({
        success: true,
        file,
      });
    } catch (error) {
      return formatError(error, {
        inputPath: params.inputPath,
        parentFolderId: params.parentFolderId,
      });
    }
  }

  async updateFileContent(
    params: FilesUpdateContentParams
  ): Promise<McpToolResult> {
    if (!isAbsolute(params.inputPath)) {
      return jsonResult({
        error: `inputPath must be an absolute path, got: ${params.inputPath}`,
      });
    }

    try {
      const file = await this.client.updateFileContent({
        fileId: params.fileId,
        inputPath: params.inputPath,
        mimeType: params.mimeType,
      });

      return jsonResult({
        success: true,
        file,
      });
    } catch (error) {
      return formatError(error, {
        fileId: params.fileId,
        inputPath: params.inputPath,
      });
    }
  }

  async createFolder(params: FilesCreateFolderParams): Promise<McpToolResult> {
    try {
      const folder = await this.client.createFolder({
        name: params.name,
        parentFolderId: params.parentFolderId,
      });
      return jsonResult({ success: true, folder });
    } catch (error) {
      return formatError(error, {
        name: params.name,
        parentFolderId: params.parentFolderId,
      });
    }
  }

  async moveFile(params: FilesMoveParams): Promise<McpToolResult> {
    if (!params.newParentFolderId && !params.newName) {
      return jsonResult({
        error: "Provide at least one of newParentFolderId or newName.",
      });
    }

    try {
      const file = await this.client.moveFile({
        fileId: params.fileId,
        newParentFolderId: params.newParentFolderId,
        newName: params.newName,
      });
      return jsonResult({ success: true, file });
    } catch (error) {
      return formatError(error, { fileId: params.fileId });
    }
  }

  async deleteFile(params: FilesDeleteParams): Promise<McpToolResult> {
    try {
      if (params.permanent) {
        if (!this.options.allowPermanentDelete) {
          return jsonResult({
            error:
              "Permanent delete is disabled. Set GDRIVE_MCP_ALLOW_PERMANENT_DELETE=true to enable, or omit `permanent` to trash the file instead.",
          });
        }
        await this.client.deleteFilePermanently(params.fileId);
        return jsonResult({
          success: true,
          fileId: params.fileId,
          deleted: "permanent",
        });
      }

      const file = await this.client.trashFile(params.fileId);
      return jsonResult({ success: true, file, deleted: "trashed" });
    } catch (error) {
      return formatError(error, {
        fileId: params.fileId,
        permanent: params.permanent,
      });
    }
  }

  async shareFile(params: FilesShareParams): Promise<McpToolResult> {
    if (!this.options.allowShare) {
      return jsonResult({
        error:
          "Sharing is disabled. Set GDRIVE_MCP_ALLOW_SHARE=true to enable.",
      });
    }

    if (params.type === "user" || params.type === "group") {
      if (!params.emailAddress) {
        return jsonResult({
          error: `emailAddress is required when type=${params.type}`,
        });
      }
    }

    if (params.type === "domain" && !params.domain) {
      return jsonResult({
        error: "domain is required when type=domain",
      });
    }

    try {
      const permission = await this.client.sharePermission({
        fileId: params.fileId,
        role: params.role,
        type: params.type,
        emailAddress: params.emailAddress,
        domain: params.domain,
        sendNotificationEmail: params.sendNotificationEmail,
        emailMessage: params.emailMessage,
      });
      return jsonResult({ success: true, permission });
    } catch (error) {
      return formatError(error, {
        fileId: params.fileId,
        role: params.role,
        type: params.type,
      });
    }
  }

  async extractImages(params: ExtractImagesParams): Promise<McpToolResult> {
    const content: Array<McpTextContent | McpImageContent> = [];
    const summary: Array<{
      fileId: string;
      name?: string;
      mimeType?: string;
      size_bytes?: number;
      status: "ok" | "skipped" | "error";
      reason?: string;
    }> = [];

    for (const fileId of params.fileIds) {
      try {
        const metadata = await this.client.getFile(
          fileId,
          "id,name,mimeType,size,webViewLink"
        );
        const mime = metadata.mimeType || "application/octet-stream";

        if (!isImageMimeType(mime)) {
          summary.push({
            fileId,
            name: metadata.name,
            mimeType: mime,
            status: "skipped",
            reason: `Not an image (mimeType=${mime})`,
          });
          continue;
        }

        const { buffer, mimeType: downloadedMime } =
          await this.client.downloadFile(fileId);
        const finalMime =
          downloadedMime && downloadedMime !== "application/octet-stream"
            ? downloadedMime
            : mime;

        content.push({
          type: "image",
          data: buffer.toString("base64"),
          mimeType: finalMime,
        });

        summary.push({
          fileId,
          name: metadata.name,
          mimeType: finalMime,
          size_bytes: buffer.length,
          status: "ok",
        });
      } catch (error) {
        summary.push({
          fileId,
          status: "error",
          reason:
            error instanceof GoogleDriveMCPError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Unknown error",
        });
      }
    }

    content.push({
      type: "text",
      text: JSON.stringify(
        {
          extracted: content.filter((c) => c.type === "image").length,
          total: params.fileIds.length,
          files: summary,
          instructions:
            "Images are returned as content blocks. Analyze them directly.",
        },
        null,
        2
      ),
    });

    return { content };
  }

  async getAbout(_params: AboutGetParams): Promise<McpToolResult> {
    try {
      const about = await this.client.getAbout();
      return jsonResult(about);
    } catch (error) {
      return formatError(error, {});
    }
  }
}

function defaultExportMime(googleDocMime: string): string | undefined {
  const map: Record<string, string> = {
    "application/vnd.google-apps.document":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.google-apps.spreadsheet":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.google-apps.presentation":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.google-apps.drawing": "image/png",
    "application/vnd.google-apps.script": "application/vnd.google-apps.script+json",
  };
  return map[googleDocMime];
}

function jsonResult(data: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function formatError(
  error: unknown,
  context: Record<string, unknown>
): McpToolResult {
  const errorMessage =
    error instanceof GoogleDriveMCPError
      ? `Google Drive Error [${error.code}]: ${error.message}`
      : `Unexpected error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;

  return jsonResult({
    error: errorMessage,
    ...context,
  });
}

export { guessMimeType };
