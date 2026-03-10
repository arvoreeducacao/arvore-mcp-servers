import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SlackClient } from "./slack-client.js";
import { AgentTeamsChatTools } from "./tools.js";
import type { SlackConfig } from "./types.js";
import {
  OpenThreadParamsSchema,
  ReplyToThreadParamsSchema,
  ReadThreadParamsSchema,
  ListThreadsParamsSchema,
  FindThreadParamsSchema,
} from "./types.js";

export class AgentTeamsChatServer {
  private server: McpServer;
  private client: SlackClient;
  private tools: AgentTeamsChatTools;

  constructor(config: SlackConfig) {
    this.server = new McpServer({
      name: "agent-teams-chat-mcp-server",
      version: "0.1.0",
    });

    this.client = new SlackClient(config);
    this.tools = new AgentTeamsChatTools(this.client, config);

    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool(
      "open_thread",
      {
        title: "Open Thread",
        description:
          "Start a new conversation thread in the team channel. Use this to discuss a topic, ask a question, or coordinate with other agents.",
        inputSchema: OpenThreadParamsSchema.shape,
      },
      async (params) => {
        const validated = OpenThreadParamsSchema.parse(params);
        return this.tools.openThread(validated);
      },
    );

    this.server.registerTool(
      "reply_to_thread",
      {
        title: "Reply to Thread",
        description:
          "Reply to an existing conversation thread. Use the thread_ts from open_thread or list_threads to target the right thread.",
        inputSchema: ReplyToThreadParamsSchema.shape,
      },
      async (params) => {
        const validated = ReplyToThreadParamsSchema.parse(params);
        return this.tools.replyToThread(validated);
      },
    );

    this.server.registerTool(
      "read_thread",
      {
        title: "Read Thread",
        description:
          "Read all messages in a conversation thread. Useful to catch up on what other agents or humans have said.",
        inputSchema: ReadThreadParamsSchema.shape,
      },
      async (params) => {
        const validated = ReadThreadParamsSchema.parse(params);
        return this.tools.readThread(validated);
      },
    );

    this.server.registerTool(
      "list_threads",
      {
        title: "List Threads",
        description:
          "List recent conversation threads in the team channel. Shows topic, reply count, and participants for each thread.",
        inputSchema: ListThreadsParamsSchema.shape,
      },
      async (params) => {
        const validated = ListThreadsParamsSchema.parse(params);
        return this.tools.listThreads(validated);
      },
    );

    this.server.registerTool(
      "find_thread",
      {
        title: "Find Thread",
        description:
          "Search for threads by topic or content. Use this to find relevant ongoing conversations before starting a new one.",
        inputSchema: FindThreadParamsSchema.shape,
      },
      async (params) => {
        const validated = FindThreadParamsSchema.parse(params);
        return this.tools.findThread(validated);
      },
    );
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Agent Teams Chat MCP Server started successfully");
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
