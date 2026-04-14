import { readFileSync } from "node:fs";
import { SlackClient } from "../slack-client.js";
import { ElevenLabsSTTClient } from "../elevenlabs-client.js";
import type {
  SendAudioParams,
  SendImageParams,
  McpToolResult,
} from "../types.js";
import { SlackAdvancedMCPError } from "../types.js";

export class UploadTools {
  constructor(
    private readonly slack: SlackClient,
    private readonly elevenlabs: ElevenLabsSTTClient | null
  ) {}

  async sendAudio(params: SendAudioParams): Promise<McpToolResult> {
    try {
      if (params.text) {
        return this.generateAndSend(params);
      }
      return this.uploadAndSend(params, "audio");
    } catch (error) {
      return this.formatError(error);
    }
  }

  async sendImage(params: SendImageParams): Promise<McpToolResult> {
    try {
      return this.uploadAndSend(params, "image");
    } catch (error) {
      return this.formatError(error);
    }
  }

  private async generateAndSend(params: SendAudioParams): Promise<McpToolResult> {
    if (!this.elevenlabs) {
      return this.ok({
        error: "ELEVENLABS_API_KEY not configured. TTS audio generation is unavailable.",
      });
    }

    const audioBuffer = await this.elevenlabs.textToSpeech({
      text: params.text!,
      voiceId: params.voice_id,
      languageCode: params.language_code,
    });

    const channelId = await this.resolveTarget(params.target, params.target_type);

    const filename = params.filename === "audio.mp3" ? "voice-message.mp3" : params.filename;

    const result = await this.slack.uploadFile({
      channelId,
      fileBuffer: audioBuffer,
      filename,
      initialComment: params.message,
      threadTs: params.thread_ts,
    });

    return this.ok({
      sent: true,
      type: "tts_audio",
      channel: channelId,
      target: params.target,
      target_type: params.target_type,
      file_id: result.fileId,
      permalink: result.permalink,
      filename,
      size_bytes: audioBuffer.length,
      tts_text: params.text,
      voice_id: params.voice_id ?? "default",
    });
  }

  private async uploadAndSend(
    params: SendAudioParams | SendImageParams,
    type: "audio" | "image"
  ): Promise<McpToolResult> {
    if (!params.file_path && !params.file_base64) {
      return this.ok({ error: "Either text (for TTS), file_path, or file_base64 is required" });
    }

    let fileBuffer: Buffer;

    if (params.file_base64) {
      fileBuffer = Buffer.from(params.file_base64, "base64");
    } else {
      try {
        fileBuffer = readFileSync(params.file_path!);
      } catch (err) {
        return this.ok({
          error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    const channelId = await this.resolveTarget(params.target, params.target_type);

    const result = await this.slack.uploadFile({
      channelId,
      fileBuffer,
      filename: params.filename,
      initialComment: params.message,
      threadTs: params.thread_ts,
    });

    return this.ok({
      sent: true,
      type,
      channel: channelId,
      target: params.target,
      target_type: params.target_type,
      file_id: result.fileId,
      permalink: result.permalink,
      filename: params.filename,
      size_bytes: fileBuffer.length,
    });
  }

  private async resolveTarget(target: string, targetType: "user" | "channel"): Promise<string> {
    if (targetType === "user") {
      const userId = await this.slack.resolveUserId(target);
      return this.slack.openDm(userId);
    }
    return this.slack.resolveChannelId(target);
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
