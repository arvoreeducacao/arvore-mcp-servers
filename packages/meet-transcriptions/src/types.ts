import { z } from "zod";

export interface TranscriptionEntry {
	id: string;
	path: string;
	title: string;
	date: string;
	duration: string;
	speakers: string[];
	content: string;
}

export interface TranscriptionCatalogEntry {
	id: string;
	title: string;
	date: string;
	duration: string;
	speakers: string[];
	snippet: string;
}

export const SearchTranscriptionsParamsSchema = z.object({
	query: z.string().min(1, "Search query is required"),
	speaker: z
		.string()
		.optional()
		.describe("Filter by speaker name (e.g. 'Speaker 1')"),
	limit: z.number().int().positive().max(50).optional().default(10),
});

export const GetTranscriptionParamsSchema = z.object({
	id: z.string().min(1, "Transcription ID is required"),
});

export const ListTranscriptionsParamsSchema = z.object({
	limit: z.number().int().positive().max(100).optional().default(20),
});

export type SearchTranscriptionsParams = z.infer<
	typeof SearchTranscriptionsParamsSchema
>;
export type GetTranscriptionParams = z.infer<
	typeof GetTranscriptionParamsSchema
>;
export type ListTranscriptionsParams = z.infer<
	typeof ListTranscriptionsParamsSchema
>;

export interface McpToolResult {
	[key: string]: unknown;
	content: Array<{
		type: "text";
		text: string;
	}>;
}

export class TranscriptionMCPError extends Error {
	constructor(
		message: string,
		public code: string,
	) {
		super(message);
		this.name = "TranscriptionMCPError";
	}
}
