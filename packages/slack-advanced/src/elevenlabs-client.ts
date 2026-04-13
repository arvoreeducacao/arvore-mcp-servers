import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { SpeechToTextChunkResponseModel } from "@elevenlabs/elevenlabs-js/api";
import { SlackAdvancedMCPError } from "./types.js";

export class ElevenLabsSTTClient {
  private readonly client: ElevenLabsClient;

  constructor(apiKey: string) {
    this.client = new ElevenLabsClient({ apiKey });
  }

  async transcribe(
    audioBuffer: Buffer,
    filename: string,
    languageCode: string = "por"
  ): Promise<SpeechToTextChunkResponseModel> {
    try {
      const result = await this.client.speechToText.convert({
        file: {
          data: audioBuffer,
          filename,
          contentType: this.getContentType(filename),
        },
        modelId: "scribe_v1",
        languageCode,
        timestampsGranularity: "word",
        diarize: true,
      });

      return result as SpeechToTextChunkResponseModel;
    } catch (error) {
      throw new SlackAdvancedMCPError(
        `ElevenLabs transcription failed: ${error instanceof Error ? error.message : "unknown"}`,
        "ELEVENLABS_ERROR"
      );
    }
  }

  private getContentType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    const types: Record<string, string> = {
      mp3: "audio/mpeg",
      mp4: "audio/mp4",
      m4a: "audio/mp4",
      wav: "audio/wav",
      webm: "audio/webm",
      ogg: "audio/ogg",
      flac: "audio/flac",
    };
    return types[ext ?? ""] ?? "audio/mpeg";
  }
}
