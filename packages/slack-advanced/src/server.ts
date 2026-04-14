import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SlackClient } from "./slack-client.js";
import { ElevenLabsSTTClient } from "./elevenlabs-client.js";
import { UserTools } from "./tools/users.js";
import { MessagingTools } from "./tools/messaging.js";
import { StyleAnalysisTools } from "./tools/style-analysis.js";
import { ThreadTools } from "./tools/threads.js";
import { AudioTools } from "./tools/audio.js";
import { ImageTools } from "./tools/images.js";
import {
  SearchUsersParamsSchema,
  GetUserProfileParamsSchema,
  SendDmParamsSchema,
  GetDmHistoryParamsSchema,
  AnalyzeWritingStyleParamsSchema,
  GetThreadFromLinkParamsSchema,
  TranscribeAudioParamsSchema,
  AnalyzeImageParamsSchema,
  GetFileInfoParamsSchema,
  SendChannelMessageParamsSchema,
} from "./types.js";

export class SlackAdvancedMCPServer {
  private readonly server: McpServer;
  private readonly userTools: UserTools;
  private readonly messagingTools: MessagingTools;
  private readonly styleTools: StyleAnalysisTools;
  private readonly threadTools: ThreadTools;
  private readonly audioTools: AudioTools;
  private readonly imageTools: ImageTools;

  constructor() {
    const slackToken = process.env.SLACK_USER_TOKEN;
    if (!slackToken) {
      throw new Error("Missing required env var: SLACK_USER_TOKEN (xoxp-... user token)");
    }

    this.server = new McpServer({
      name: "slack-advanced-mcp-server",
      version: "1.0.0",
    });

    const slack = new SlackClient(
      slackToken,
      process.env.SLACK_USERS_CACHE_PATH,
      process.env.SLACK_USERS_CACHE_TTL_MINUTES ? parseInt(process.env.SLACK_USERS_CACHE_TTL_MINUTES, 10) : undefined
    );

    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    const elevenlabs = elevenLabsKey ? new ElevenLabsSTTClient(elevenLabsKey) : null;

    if (!elevenLabsKey) {
      console.error("⚠️  ELEVENLABS_API_KEY not set — audio transcription will be unavailable");
    }

    this.userTools = new UserTools(slack);
    this.messagingTools = new MessagingTools(slack);
    this.styleTools = new StyleAnalysisTools(slack);
    this.threadTools = new ThreadTools(slack);
    this.audioTools = new AudioTools(slack, elevenlabs);
    this.imageTools = new ImageTools(slack);

    this.setupTools();
  }

  private setupTools(): void {
    this.server.registerTool("search_users", {
      title: "Search Users",
      description:
        "Fuzzy search for Slack users by name, email, or display name. Returns ranked results with match scores.",
      inputSchema: SearchUsersParamsSchema.shape,
    }, async (params) => {
      return this.userTools.searchUsers(SearchUsersParamsSchema.parse(params));
    });

    this.server.registerTool("get_user_profile", {
      title: "Get User Profile",
      description:
        "Get full profile of a Slack user including title, status, timezone, and avatar.",
      inputSchema: GetUserProfileParamsSchema.shape,
    }, async (params) => {
      return this.userTools.getUserProfile(GetUserProfileParamsSchema.parse(params));
    });

    this.server.registerTool("send_dm", {
      title: "Send DM",
      description:
        "Send a direct message to a user. Resolves user by name, email, or ID automatically. Opens DM channel if needed. Messages are sent as the authenticated user.",
      inputSchema: SendDmParamsSchema.shape,
    }, async (params) => {
      return this.messagingTools.sendDm(SendDmParamsSchema.parse(params));
    });

    this.server.registerTool("send_channel_message", {
      title: "Send Channel Message",
      description:
        "Send a message to a Slack channel. Accepts channel ID or #channel-name. Supports thread replies and markdown link conversion.",
      inputSchema: SendChannelMessageParamsSchema.shape,
    }, async (params) => {
      return this.messagingTools.sendChannelMessage(SendChannelMessageParamsSchema.parse(params));
    });

    this.server.registerTool("get_dm_history", {
      title: "Get DM History",
      description:
        "Get DM conversation history with a user. Resolves user by name, email, or ID. Supports pagination.",
      inputSchema: GetDmHistoryParamsSchema.shape,
    }, async (params) => {
      return this.messagingTools.getDmHistory(GetDmHistoryParamsSchema.parse(params));
    });

    this.server.registerTool("analyze_writing_style", {
      title: "Analyze Writing Style",
      description:
        "Analyze a user's writing style from their messages. Returns metrics like avg length, emoji usage, punctuation patterns, vocabulary richness, formality score, and top words. Useful for understanding communication patterns or drafting messages in someone's style.",
      inputSchema: AnalyzeWritingStyleParamsSchema.shape,
    }, async (params) => {
      return this.styleTools.analyzeWritingStyle(AnalyzeWritingStyleParamsSchema.parse(params));
    });

    this.server.registerTool("get_thread_from_link", {
      title: "Get Thread From Link",
      description:
        "Extract all messages from a Slack thread given its URL. Resolves user names and returns structured message data with participants.",
      inputSchema: GetThreadFromLinkParamsSchema.shape,
    }, async (params) => {
      return this.threadTools.getThreadFromLink(GetThreadFromLinkParamsSchema.parse(params));
    });

    this.server.registerTool("transcribe_audio", {
      title: "Transcribe Audio",
      description:
        "Download an audio file shared in Slack and transcribe it using ElevenLabs STT. Returns text with word-level timestamps and speaker diarization. Requires ELEVENLABS_API_KEY.",
      inputSchema: TranscribeAudioParamsSchema.shape,
    }, async (params) => {
      return this.audioTools.transcribeAudio(TranscribeAudioParamsSchema.parse(params));
    });

    this.server.registerTool("analyze_image", {
      title: "Analyze Image",
      description:
        "Download an image shared in Slack and return it as base64 content for the model to analyze directly. Optionally include a specific question about the image.",
      inputSchema: AnalyzeImageParamsSchema.shape,
    }, async (params) => {
      return this.imageTools.analyzeImage(AnalyzeImageParamsSchema.parse(params));
    });

    this.server.registerTool("get_file_info", {
      title: "Get File Info",
      description:
        "Get metadata about a file shared in Slack (name, type, size, permalink, download URL).",
      inputSchema: GetFileInfoParamsSchema.shape,
    }, async (params) => {
      return this.imageTools.getFileInfo(GetFileInfoParamsSchema.parse(params));
    });
  }

  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("✅ Slack Advanced MCP Server started");
    } catch (error) {
      console.error(
        "Failed to start Slack Advanced MCP Server:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
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
