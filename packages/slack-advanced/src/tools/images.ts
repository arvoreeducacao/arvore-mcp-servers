import { SlackClient } from "../slack-client.js";
import type {
  AnalyzeImageParams,
  GetFileInfoParams,
  McpToolResult,
  McpTextContent,
  McpImageContent,
} from "../types.js";
import { SlackAdvancedMCPError } from "../types.js";

export class ImageTools {
  constructor(private readonly slack: SlackClient) {}

  async analyzeImage(params: AnalyzeImageParams): Promise<McpToolResult> {
    try {
      if (!params.file_url && !params.file_id) {
        return this.ok({ error: "Either file_url or file_id is required" });
      }

      let fileUrl: string;
      let filename: string;
      let mimetype: string;

      if (params.file_id) {
        const fileInfo = await this.slack.getFileInfo(params.file_id);
        fileUrl = fileInfo.url_private;
        filename = fileInfo.name;
        mimetype = fileInfo.mimetype;
      } else {
        fileUrl = params.file_url!;
        filename = fileUrl.split("/").pop() ?? "image.png";
        mimetype = this.guessMimeType(filename);
      }

      const imageBuffer = await this.slack.downloadFile(fileUrl);
      const base64 = imageBuffer.toString("base64");

      const imageContent: McpImageContent = {
        type: "image",
        data: base64,
        mimeType: mimetype,
      };

      const textContent: McpTextContent = {
        type: "text",
        text: JSON.stringify({
          filename,
          mimetype,
          size_bytes: imageBuffer.length,
          question: params.question ?? "Describe this image",
          instructions: "The image has been returned as content. The calling model should analyze it directly.",
        }, null, 2),
      };

      return {
        content: [imageContent, textContent],
      };
    } catch (error) {
      return this.formatError(error);
    }
  }

  async getFileInfo(params: GetFileInfoParams): Promise<McpToolResult> {
    try {
      const file = await this.slack.getFileInfo(params.file_id);

      return this.ok({
        id: file.id,
        name: file.name,
        mimetype: file.mimetype,
        filetype: file.filetype,
        size: file.size,
        permalink: file.permalink,
        url_private: file.url_private,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  private guessMimeType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    const types: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      bmp: "image/bmp",
    };
    return types[ext ?? ""] ?? "image/png";
  }

  private ok(data: unknown): McpToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private formatError(error: unknown): McpToolResult {
    const message =
      error instanceof SlackAdvancedMCPError
        ? `Slack Error: ${error.message}`
        : error instanceof Error
          ? `Unexpected error: ${error.message}`
          : "Unexpected error: Unknown error";

    return {
      content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    };
  }
}
