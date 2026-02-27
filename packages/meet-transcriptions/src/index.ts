#!/usr/bin/env node

import { homedir } from "node:os";
import { resolve } from "node:path";
import { TranscriptionMCPServer } from "./server.js";

const transcriptionsPath = resolve(
	process.env.TRANSCRIPTIONS_PATH ||
		`${homedir()}/Documents/meet-transcriptions`,
);
const embeddingModel = process.env.TRANSCRIPTION_EMBEDDING_MODEL;

try {
	const server = new TranscriptionMCPServer(transcriptionsPath, embeddingModel);
	server.setupGracefulShutdown();
	await server.start();
} catch (error) {
	console.error("Failed to start Meet Transcriptions MCP Server:", error);
	process.exit(1);
}

export { EmbeddingEngine } from "./embeddings.js";
export { TranscriptionMCPServer } from "./server.js";
export { TranscriptionStore } from "./store.js";
export { TranscriptionMCPTools } from "./tools.js";
export * from "./types.js";
