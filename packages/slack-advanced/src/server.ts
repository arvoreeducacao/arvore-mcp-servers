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
import { UploadTools } from "./tools/uploads.js";
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
  DownloadFileParamsSchema,
  SendChannelMessageParamsSchema,
  SendAudioParamsSchema,
  SendImageParamsSchema,
  SendFileParamsSchema,
  EditMessageParamsSchema,
  DeleteMessageParamsSchema,
  AddReactionParamsSchema,
  RemoveReactionParamsSchema,
} from "./types.js";

export class SlackAdvancedMCPServer {
  private readonly server: McpServer;
  private readonly userTools: UserTools;
  private readonly messagingTools: MessagingTools;
  private readonly styleTools: StyleAnalysisTools;
  private readonly threadTools: ThreadTools;
  private readonly audioTools: AudioTools;
  private readonly imageTools: ImageTools;
  private readonly uploadTools: UploadTools;

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
    const defaultVoiceId = process.env.ELEVENLABS_DEFAULT_VOICE_ID;
    const elevenlabs = elevenLabsKey ? new ElevenLabsSTTClient(elevenLabsKey, defaultVoiceId) : null;

    if (!elevenLabsKey) {
      console.error("⚠️  ELEVENLABS_API_KEY not set — audio transcription will be unavailable");
    }

    this.userTools = new UserTools(slack);
    this.messagingTools = new MessagingTools(slack);
    this.styleTools = new StyleAnalysisTools(slack);
    this.threadTools = new ThreadTools(slack);
    this.audioTools = new AudioTools(slack, elevenlabs);
    this.imageTools = new ImageTools(slack);
    this.uploadTools = new UploadTools(slack, elevenlabs);

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

    this.server.registerTool("download_file", {
      title: "Download File",
      description:
        "Download a file shared in Slack and return its content. Text-based files (HTML, JSON, CSV, code, etc.) are returned as UTF-8 text. Binary files are returned as base64. Use file IDs from get_dm_history or get_file_info.",
      inputSchema: DownloadFileParamsSchema.shape,
    }, async (params) => {
      return this.imageTools.downloadFile(DownloadFileParamsSchema.parse(params));
    });

    this.server.registerTool("send_audio", {
      title: "Send Audio",
      description:
        "Send an audio message to a Slack user (DM) or channel. Can generate speech from text using ElevenLabs TTS (pass 'text' param) or upload an existing audio file (pass file_path or file_base64). Supports thread replies.",
      inputSchema: SendAudioParamsSchema.shape,
    }, async (params) => {
      return this.uploadTools.sendAudio(SendAudioParamsSchema.parse(params));
    });

    this.server.registerTool("send_image", {
      title: "Send Image",
      description:
        "Upload and send an image to a Slack user (DM) or channel. Accepts a file path on disk or base64-encoded content. Supports thread replies.",
      inputSchema: SendImageParamsSchema.shape,
    }, async (params) => {
      return this.uploadTools.sendImage(SendImageParamsSchema.parse(params));
    });

    this.server.registerTool("send_file", {
      title: "Send File",
      description:
        "Upload and send any file to a Slack user (DM) or channel. Accepts a file path on disk, base64-encoded content, or raw text content. Works with any file type (PDF, CSV, HTML, ZIP, etc.). Supports thread replies.",
      inputSchema: SendFileParamsSchema.shape,
    }, async (params) => {
      return this.uploadTools.sendFile(SendFileParamsSchema.parse(params));
    });

    this.server.registerTool("edit_message", {
      title: "Edit Message",
      description:
        "Edit a message that was previously sent by the authenticated user. Requires the channel ID and message timestamp (ts). Only your own messages can be edited.",
      inputSchema: EditMessageParamsSchema.shape,
    }, async (params) => {
      return this.messagingTools.editMessage(EditMessageParamsSchema.parse(params));
    });

    this.server.registerTool("delete_message", {
      title: "Delete Message",
      description:
        "Delete a message from a channel or DM. You can delete your own messages, or any message in channels where the token has admin permissions.",
      inputSchema: DeleteMessageParamsSchema.shape,
    }, async (params) => {
      return this.messagingTools.deleteMessage(DeleteMessageParamsSchema.parse(params));
    });

    this.server.registerTool("add_reaction", {
      title: "Add Reaction",
      description:
        "Add an emoji reaction to a message. Use emoji names without colons (e.g. thumbsup, heart, eyes, white_check_mark, rocket).",
      inputSchema: AddReactionParamsSchema.shape,
    }, async (params) => {
      return this.messagingTools.addReaction(AddReactionParamsSchema.parse(params));
    });

    this.server.registerTool("remove_reaction", {
      title: "Remove Reaction",
      description:
        "Remove an emoji reaction from a message. Only removes reactions added by the authenticated user.",
      inputSchema: RemoveReactionParamsSchema.shape,
    }, async (params) => {
      return this.messagingTools.removeReaction(RemoveReactionParamsSchema.parse(params));
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
