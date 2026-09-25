import { SlackClient } from "../slack-client.js";
import { ElevenLabsSTTClient } from "../elevenlabs-client.js";
import { toSlackText } from "../formatting.js";
import type {
  SendAudioParams,
  SendImageParams,
  SendFileParams,
  McpToolResult,
} from "../types.js";
import { toolError, toolOk } from "./result.js";
import { FileAccessPolicy } from "../file-access.js";

export class UploadTools {
  constructor(
    private readonly slack: SlackClient,
    private readonly elevenlabs: ElevenLabsSTTClient | null,
    private readonly files: FileAccessPolicy = new FileAccessPolicy()
  ) {}

  private caption(params: { message?: string; format?: "markdown" | "mrkdwn" }): string | undefined {
    if (!params.message) return undefined;
    return toSlackText(params.message, params.format ?? "mrkdwn");
  }

  async sendAudio(params: SendAudioParams): Promise<McpToolResult> {
    try {
      if (params.text) {
        return await this.generateAndSend(params);
      }
      return await this.uploadAndSend(params, "audio");
    } catch (error) {
      return toolError(error);
    }
  }

  async sendImage(params: SendImageParams): Promise<McpToolResult> {
    try {
      return await this.uploadAndSend(params, "image");
    } catch (error) {
      return toolError(error);
    }
  }

  async sendFile(params: SendFileParams): Promise<McpToolResult> {
    try {
      if (!params.file_path && !params.file_base64 && !params.content) {
        return toolError("Either file_path, file_base64, or content is required");
      }

      let fileBuffer: Buffer;

      if (params.content) {
        fileBuffer = Buffer.from(params.content, "utf-8");
      } else if (params.file_base64) {
        fileBuffer = Buffer.from(params.file_base64, "base64");
      } else {
        try {
          fileBuffer = this.files.read(params.file_path!);
        } catch (err) {
          return toolError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const channelId = await this.resolveTarget(params.target, params.target_type);

      const result = await this.slack.uploadFile({
        channelId,
        fileBuffer,
        filename: params.filename,
        initialComment: this.caption(params),
        threadTs: params.thread_ts,
      });

      return toolOk({
        sent: true,
        type: "file",
        channel: channelId,
        target: params.target,
        target_type: params.target_type,
        file_id: result.fileId,
        permalink: result.permalink,
        filename: params.filename,
        size_bytes: fileBuffer.length,
      });
    } catch (error) {
      return toolError(error);
    }
  }

  private async generateAndSend(params: SendAudioParams): Promise<McpToolResult> {
    if (!this.elevenlabs) {
      return toolError("ELEVENLABS_API_KEY not configured. TTS audio generation is unavailable.");
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
      initialComment: this.caption(params),
      threadTs: params.thread_ts,
    });

    return toolOk({
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
      return toolError("Either text (for TTS), file_path, or file_base64 is required");
    }

    let fileBuffer: Buffer;

    if (params.file_base64) {
      fileBuffer = Buffer.from(params.file_base64, "base64");
    } else {
      try {
        fileBuffer = this.files.read(params.file_path!);
      } catch (err) {
        return toolError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const channelId = await this.resolveTarget(params.target, params.target_type);

    const result = await this.slack.uploadFile({
      channelId,
      fileBuffer,
      filename: params.filename,
      initialComment: this.caption(params),
      threadTs: params.thread_ts,
    });

    return toolOk({
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
}
