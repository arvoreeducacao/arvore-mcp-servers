import { TranscriptionStore } from "./store.js";
import {
  type SearchTranscriptionsParams,
  type GetTranscriptionParams,
  type ListTranscriptionsParams,
  type McpToolResult,
  TranscriptionMCPError,
} from "./types.js";

export class TranscriptionMCPTools {
  constructor(private store: TranscriptionStore) {}

  async searchTranscriptions(params: SearchTranscriptionsParams): Promise<McpToolResult> {
    try {
      const results = await this.store.search(params.query, {
        speaker: params.speaker,
        limit: params.limit,
      });
      return { content: [{ type: "text", text: JSON.stringify({ query: params.query, count: results.length, results }, null, 2) }] };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async getTranscription(params: GetTranscriptionParams): Promise<McpToolResult> {
    try {
      const entry = this.store.get(params.id);
      if (!entry) {
        return { content: [{ type: "text", text: JSON.stringify({ error: `Transcription "${params.id}" not found` }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify({ id: entry.id, title: entry.title, date: entry.date, duration: entry.duration, speakers: entry.speakers, content: entry.content }, null, 2) }] };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  async listTranscriptions(params: ListTranscriptionsParams): Promise<McpToolResult> {
    try {
      const results = this.store.list({ limit: params.limit });
      return { content: [{ type: "text", text: JSON.stringify({ count: results.length, transcriptions: results }, null, 2) }] };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private errorResult(error: unknown): McpToolResult {
    const message = error instanceof TranscriptionMCPError
      ? `Transcription Error: ${error.message}`
      : `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`;
    return { content: [{ type: "text", text: JSON.stringify({ error: message }) }] };
  }
}
