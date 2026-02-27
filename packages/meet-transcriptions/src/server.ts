import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TranscriptionStore } from "./store.js";
import { TranscriptionMCPTools } from "./tools.js";
import {
	GetTranscriptionParamsSchema,
	ListTranscriptionsParamsSchema,
	SearchTranscriptionsParamsSchema,
} from "./types.js";

export class TranscriptionMCPServer {
	private server: McpServer;
	private store: TranscriptionStore;
	private tools: TranscriptionMCPTools;

	constructor(transcriptionsPath: string, embeddingModel?: string) {
		this.server = new McpServer({
			name: "meet-transcriptions-mcp-server",
			version: "1.0.0",
		});

		this.store = new TranscriptionStore(transcriptionsPath, embeddingModel);
		this.tools = new TranscriptionMCPTools(this.store);

		this.setupTools();
	}

	private setupTools(): void {
		this.server.registerTool(
			"search_transcriptions",
			{
				title: "Search Meeting Transcriptions",
				description:
					"Semantic search across meeting transcriptions. " +
					"Use this to find what was discussed in meetings. " +
					"Examples: 'deploy strategy discussion', 'bug in authentication', 'sprint planning decisions'.",
				inputSchema: SearchTranscriptionsParamsSchema.shape,
			},
			async (params) => {
				const validated = SearchTranscriptionsParamsSchema.parse(params);
				return this.tools.searchTranscriptions(validated);
			},
		);

		this.server.registerTool(
			"get_transcription",
			{
				title: "Get Full Transcription",
				description:
					"Get the full content of a specific meeting transcription by ID. " +
					"Use after search_transcriptions to read the complete transcript.",
				inputSchema: GetTranscriptionParamsSchema.shape,
			},
			async (params) => {
				const validated = GetTranscriptionParamsSchema.parse(params);
				return this.tools.getTranscription(validated);
			},
		);

		this.server.registerTool(
			"list_transcriptions",
			{
				title: "List Meeting Transcriptions",
				description:
					"List all meeting transcriptions sorted by date (most recent first). " +
					"Returns a catalog with titles, dates, durations, and snippets.",
				inputSchema: ListTranscriptionsParamsSchema.shape,
			},
			async (params) => {
				const validated = ListTranscriptionsParamsSchema.parse(params);
				return this.tools.listTranscriptions(validated);
			},
		);
	}

	async start(): Promise<void> {
		await this.store.load();
		const transport = new StdioServerTransport();
		await this.server.connect(transport);
		console.error("Meet Transcriptions MCP Server started successfully");
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
