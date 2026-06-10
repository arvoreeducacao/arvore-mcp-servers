import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { SpeechToTextChunkResponseModel } from "@elevenlabs/elevenlabs-js/api";
import { SlackAdvancedMCPError } from "./types.js";

export class ElevenLabsSTTClient {
  private readonly client: ElevenLabsClient;
  private readonly defaultVoiceId: string;

  constructor(apiKey: string, defaultVoiceId?: string) {
    this.client = new ElevenLabsClient({ apiKey });
    this.defaultVoiceId = defaultVoiceId ?? "JBFqnCBsd6RMkjVDRZzb";
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

  async textToSpeech(params: {
    text: string;
    voiceId?: string;
    modelId?: string;
    languageCode?: string;
    outputFormat?: string;
  }): Promise<Buffer> {
    try {
      const voiceId = params.voiceId ?? this.defaultVoiceId;
      const modelId = params.modelId ?? "eleven_multilingual_v2";

      const response = await this.client.textToSpeech.convert(voiceId, {
        text: params.text,
        modelId,
        languageCode: params.languageCode,
        outputFormat: (params.outputFormat ?? "mp3_44100_128") as never,
      });

      const reader = response.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      return Buffer.from(result);
    } catch (error) {
      throw new SlackAdvancedMCPError(
        `ElevenLabs TTS failed: ${error instanceof Error ? error.message : "unknown"}`,
        "ELEVENLABS_TTS_ERROR"
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
