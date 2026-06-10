import { SlackClient } from "../slack-client.js";
import { ElevenLabsSTTClient } from "../elevenlabs-client.js";
import type {
  TranscribeAudioParams,
  McpToolResult,
} from "../types.js";
import { SlackAdvancedMCPError } from "../types.js";

export class AudioTools {
  constructor(
    private readonly slack: SlackClient,
    private readonly elevenlabs: ElevenLabsSTTClient | null
  ) {}

  async transcribeAudio(params: TranscribeAudioParams): Promise<McpToolResult> {
    if (!this.elevenlabs) {
      return this.ok({
        error: "ELEVENLABS_API_KEY not configured. Audio transcription is unavailable.",
      });
    }

    try {
      if (!params.file_url && !params.file_id) {
        return this.ok({ error: "Either file_url or file_id is required" });
      }

      let fileUrl: string;
      let filename: string;

      if (params.file_id) {
        const fileInfo = await this.slack.getFileInfo(params.file_id);
        fileUrl = fileInfo.url_private;
        filename = fileInfo.name;
      } else {
        fileUrl = params.file_url!;
        filename = fileUrl.split("/").pop() ?? "audio.mp3";
      }

      const audioBuffer = await this.slack.downloadFile(fileUrl);

      const result = await this.elevenlabs.transcribe(
        audioBuffer,
        filename,
        params.language_code
      );

      const lastWord = (result.words ?? []).at(-1);

      return this.ok({
        text: result.text,
        language: result.languageCode,
        duration_seconds: lastWord?.end ?? null,
      });
    } catch (error) {
      return this.formatError(error);
    }
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
