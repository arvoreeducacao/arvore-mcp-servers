import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleDriveClient } from "./client.js";
import { GoogleDriveMCPTools } from "./tools.js";
import {
  AboutGetParamsSchema,
  ExtractImagesParamsSchema,
  FilesCreateFolderParamsSchema,
  FilesDeleteParamsSchema,
  FilesDownloadParamsSchema,
  FilesGetParamsSchema,
  FilesListParamsSchema,
  FilesMoveParamsSchema,
  FilesShareParamsSchema,
  FilesUpdateContentParamsSchema,
  FilesUploadParamsSchema,
  GoogleDriveClientConfig,
} from "./types.js";

export interface GoogleDriveMCPServerOptions {
  client: GoogleDriveClientConfig;
  allowShare: boolean;
  allowPermanentDelete: boolean;
}

export class GoogleDriveMCPServer {
  private server: McpServer;
  private client: GoogleDriveClient;
  private tools: GoogleDriveMCPTools;

  constructor(options: GoogleDriveMCPServerOptions) {
    this.server = new McpServer({
      name: "google-drive-mcp-server",
      version: "1.0.0",
    });

    this.client = new GoogleDriveClient(options.client);
    this.tools = new GoogleDriveMCPTools(this.client, {
      allowShare: options.allowShare,
      allowPermanentDelete: options.allowPermanentDelete,
    });

    this.setupTools(options);
  }

  private setupTools(options: GoogleDriveMCPServerOptions): void {
    this.server.registerTool(
      "files_list",
      {
        title: "List / Search Files",
        description:
          "List or search Drive files using Drive query syntax (e.g. \"name contains 'invoice'\", \"mimeType='application/pdf'\", \"'<folderId>' in parents\"). Supports My Drive and Shared Drives.",
        inputSchema: FilesListParamsSchema.shape,
      },
      async (params) => {
        const validated = FilesListParamsSchema.parse(params);
        return this.tools.listFiles(validated);
      }
    );

    this.server.registerTool(
      "files_get",
      {
        title: "Get File Metadata",
        description:
          "Get metadata for a specific Drive file (id, name, mimeType, parents, owners, sizes, links, timestamps).",
        inputSchema: FilesGetParamsSchema.shape,
      },
      async (params) => {
        const validated = FilesGetParamsSchema.parse(params);
        return this.tools.getFile(validated);
      }
    );

    this.server.registerTool(
      "files_download",
      {
        title: "Download File",
        description:
          "Download a Drive file to an absolute local path. For Google-native files (Docs/Sheets/Slides) pass exportMimeType (e.g. 'application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document').",
        inputSchema: FilesDownloadParamsSchema.shape,
      },
      async (params) => {
        const validated = FilesDownloadParamsSchema.parse(params);
        return this.tools.downloadFile(validated);
      }
    );

    this.server.registerTool(
      "files_upload",
      {
        title: "Upload File",
        description:
          "Upload a local file to Drive. Pass parentFolderId to place inside a specific folder. MIME type is inferred from the file extension when omitted.",
        inputSchema: FilesUploadParamsSchema.shape,
      },
      async (params) => {
        const validated = FilesUploadParamsSchema.parse(params);
        return this.tools.uploadFile(validated);
      }
    );

    this.server.registerTool(
      "files_update_content",
      {
        title: "Update File Content",
        description:
          "Replace the content of an existing Drive file with new bytes from a local path. Keeps the same fileId.",
        inputSchema: FilesUpdateContentParamsSchema.shape,
      },
      async (params) => {
        const validated = FilesUpdateContentParamsSchema.parse(params);
        return this.tools.updateFileContent(validated);
      }
    );

    this.server.registerTool(
      "files_create_folder",
      {
        title: "Create Folder",
        description:
          "Create a new folder. Pass parentFolderId to nest it; otherwise it's created in My Drive root.",
        inputSchema: FilesCreateFolderParamsSchema.shape,
      },
      async (params) => {
        const validated = FilesCreateFolderParamsSchema.parse(params);
        return this.tools.createFolder(validated);
      }
    );

    this.server.registerTool(
      "files_move",
      {
        title: "Move / Rename File",
        description:
          "Move a file/folder to a new parent and/or rename it. Provide newParentFolderId, newName, or both.",
        inputSchema: FilesMoveParamsSchema.shape,
      },
      async (params) => {
        const validated = FilesMoveParamsSchema.parse(params);
        return this.tools.moveFile(validated);
      }
    );

    this.server.registerTool(
      "files_delete",
      {
        title: "Trash / Delete File",
        description:
          "Move a file to trash (default, reversible for 30 days) or delete permanently when permanent=true (gated by GDRIVE_MCP_ALLOW_PERMANENT_DELETE=true).",
        inputSchema: FilesDeleteParamsSchema.shape,
      },
      async (params) => {
        const validated = FilesDeleteParamsSchema.parse(params);
        return this.tools.deleteFile(validated);
      }
    );

    this.server.registerTool(
      "extract_images",
      {
        title: "Extract Images",
        description:
          "Download one or more Drive image files and return them as image content blocks for the model to analyze (same format as Slack/Linear extract_images). Skips non-image files. Max 20 per call.",
        inputSchema: ExtractImagesParamsSchema.shape,
      },
      async (params) => {
        const validated = ExtractImagesParamsSchema.parse(params);
        return this.tools.extractImages(validated);
      }
    );

    this.server.registerTool(
      "about_get",
      {
        title: "Get Drive Account Info",
        description:
          "Get information about the authenticated user (display name, email) and storage quota.",
        inputSchema: AboutGetParamsSchema.shape,
      },
      async (params) => {
        const validated = AboutGetParamsSchema.parse(params);
        return this.tools.getAbout(validated);
      }
    );

    if (options.allowShare) {
      this.server.registerTool(
        "files_share",
        {
          title: "Share File",
          description:
            "Add a permission to a file/folder. Requires GDRIVE_MCP_ALLOW_SHARE=true. Use type=user|group with emailAddress, type=domain with domain, or type=anyone for link sharing.",
          inputSchema: FilesShareParamsSchema.shape,
        },
        async (params) => {
          const validated = FilesShareParamsSchema.parse(params);
          return this.tools.shareFile(validated);
        }
      );
    }
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Google Drive MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start Google Drive MCP Server:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", async (error) => {
      console.error("Uncaught exception:", error);
      process.exit(1);
    });
    process.on("unhandledRejection", async (reason) => {
      console.error("Unhandled rejection:", reason);
      process.exit(1);
    });
  }
}
