import { z } from "zod";

export const SearchUsersParamsSchema = z.object({
  query: z
    .string()
    .min(1, "Search query is required")
    .describe("Name, email, display name, or partial match to search for"),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(10)
    .describe("Maximum number of results to return"),
});

export const GetUserProfileParamsSchema = z.object({
  user_id: z
    .string()
    .min(1, "User ID is required")
    .describe("Slack user ID (e.g. U01ABC123)"),
});

export const MessageMetadataSchema = z.object({
  event_type: z
    .string()
    .min(1, "Event type is required")
    .describe("A unique identifier for the metadata event (e.g. 'task_created', 'deploy_completed')"),
  event_payload: z
    .record(z.unknown())
    .describe("Structured key-value payload for the event. Other apps can read this metadata to trigger automations"),
});

export const SendDmParamsSchema = z.object({
  user: z
    .string()
    .min(1, "User identifier is required")
    .describe("User ID, email, or display name to send DM to"),
  text: z
    .string()
    .min(1, "Message text is required")
    .describe("Message content (supports Slack mrkdwn)"),
  thread_ts: z
    .string()
    .optional()
    .describe("Thread timestamp to reply in a thread"),
  metadata: MessageMetadataSchema
    .optional()
    .describe("Structured metadata to attach to the message. Used for app-to-app communication via Slack message metadata"),
});

export const GetDmHistoryParamsSchema = z.object({
  user: z
    .string()
    .min(1, "User identifier is required")
    .describe("User ID, email, or display name"),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .default(20)
    .describe("Number of messages to retrieve"),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor from previous response"),
});

export const AnalyzeWritingStyleParamsSchema = z.object({
  user: z
    .string()
    .min(1, "User identifier is required")
    .describe("User ID, email, or display name to analyze"),
  sample_size: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .default(100)
    .describe("Number of recent messages to analyze"),
  channel_id: z
    .string()
    .optional()
    .describe("Specific channel to analyze from. If omitted, uses DM history"),
});

export const GetThreadFromLinkParamsSchema = z.object({
  url: z
    .string()
    .min(1, "Slack thread URL is required")
    .describe("Slack message/thread URL (e.g. https://workspace.slack.com/archives/C01.../p1234...)"),
  limit: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .default(100)
    .describe("Maximum number of replies to fetch"),
});

export const TranscribeAudioParamsSchema = z.object({
  file_url: z
    .string()
    .optional()
    .describe("Slack file URL (url_private from files.info). Either file_url or file_id is required"),
  file_id: z
    .string()
    .optional()
    .describe("Slack file ID. Either file_url or file_id is required"),
  language_code: z
    .string()
    .optional()
    .default("por")
    .describe("Language code for transcription (e.g. por, eng, spa)"),
});

export const AnalyzeImageParamsSchema = z.object({
  file_url: z
    .string()
    .optional()
    .describe("Slack file URL (url_private from files.info). Either file_url or file_id is required"),
  file_id: z
    .string()
    .optional()
    .describe("Slack file ID. Either file_url or file_id is required"),
  question: z
    .string()
    .optional()
    .describe("Specific question about the image. If omitted, returns a general description"),
});

export const GetFileInfoParamsSchema = z.object({
  file_id: z
    .string()
    .min(1, "File ID is required")
    .describe("Slack file ID"),
});

export const DownloadFileParamsSchema = z.object({
  file_id: z
    .string()
    .min(1, "File ID is required")
    .describe("Slack file ID to download"),
  file_url: z
    .string()
    .optional()
    .describe("Slack file URL (url_private). If provided, skips files.info lookup"),
  max_size_mb: z
    .number()
    .positive()
    .optional()
    .default(10)
    .describe("Maximum file size in MB to download (default 10MB)"),
});

export const SendChannelMessageParamsSchema = z.object({
  channel: z
    .string()
    .min(1, "Channel is required")
    .describe("Channel ID (e.g. C01EXAMPLE) or channel name (e.g. #general)"),
  text: z
    .string()
    .min(1, "Message text is required")
    .describe("Message content (supports Slack mrkdwn)"),
  thread_ts: z
    .string()
    .optional()
    .describe("Thread timestamp to reply in a thread"),
  content_type: z
    .enum(["text/plain", "text/markdown"])
    .optional()
    .describe("Content type for link formatting. Use text/markdown for [text](url) links"),
  metadata: MessageMetadataSchema
    .optional()
    .describe("Structured metadata to attach to the message. Used for app-to-app communication via Slack message metadata"),
});

export const SendAudioParamsSchema = z.object({
  target: z
    .string()
    .min(1, "Target is required")
    .describe("User (name, email, or ID) or channel (ID or #channel-name) to send the audio to"),
  target_type: z
    .enum(["user", "channel"])
    .describe("Whether the target is a user (DM) or a channel"),
  text: z
    .string()
    .optional()
    .describe("Text to convert to speech using ElevenLabs TTS. Use this to send a voice message generated from text. Mutually exclusive with file_path/file_base64"),
  voice_id: z
    .string()
    .optional()
    .describe("ElevenLabs voice ID for TTS. Defaults to George (JBFqnCBsd6RMkjVDRZzb)"),
  language_code: z
    .string()
    .optional()
    .describe("Language code for TTS (e.g. pt, en, es). Helps with pronunciation"),
  file_path: z
    .string()
    .optional()
    .describe("Absolute path to the audio file on disk. Either text, file_path, or file_base64 is required"),
  file_base64: z
    .string()
    .optional()
    .describe("Base64-encoded audio content. Either text, file_path, or file_base64 is required"),
  filename: z
    .string()
    .optional()
    .default("audio.mp3")
    .describe("Filename for the uploaded audio (e.g. message.mp3, recording.ogg)"),
  message: z
    .string()
    .optional()
    .describe("Optional text message to accompany the audio"),
  thread_ts: z
    .string()
    .optional()
    .describe("Thread timestamp to reply in a thread"),
});

export const SendImageParamsSchema = z.object({
  target: z
    .string()
    .min(1, "Target is required")
    .describe("User (name, email, or ID) or channel (ID or #channel-name) to send the image to"),
  target_type: z
    .enum(["user", "channel"])
    .describe("Whether the target is a user (DM) or a channel"),
  file_path: z
    .string()
    .optional()
    .describe("Absolute path to the image file on disk. Either file_path or file_base64 is required"),
  file_base64: z
    .string()
    .optional()
    .describe("Base64-encoded image content. Either file_path or file_base64 is required"),
  filename: z
    .string()
    .optional()
    .default("image.png")
    .describe("Filename for the uploaded image (e.g. screenshot.png, photo.jpg)"),
  message: z
    .string()
    .optional()
    .describe("Optional text message to accompany the image"),
  thread_ts: z
    .string()
    .optional()
    .describe("Thread timestamp to reply in a thread"),
});

export const SendFileParamsSchema = z.object({
  target: z
    .string()
    .min(1, "Target is required")
    .describe("User (name, email, or ID) or channel (ID or #channel-name) to send the file to"),
  target_type: z
    .enum(["user", "channel"])
    .describe("Whether the target is a user (DM) or a channel"),
  file_path: z
    .string()
    .optional()
    .describe("Absolute path to the file on disk. Either file_path, file_base64, or content is required"),
  file_base64: z
    .string()
    .optional()
    .describe("Base64-encoded file content. Either file_path, file_base64, or content is required"),
  content: z
    .string()
    .optional()
    .describe("Raw text content to send as a file (for text/code/HTML files). Either file_path, file_base64, or content is required"),
  filename: z
    .string()
    .min(1, "Filename is required")
    .describe("Filename with extension (e.g. report.pdf, data.csv, page.html)"),
  message: z
    .string()
    .optional()
    .describe("Optional text message to accompany the file"),
  thread_ts: z
    .string()
    .optional()
    .describe("Thread timestamp to reply in a thread"),
});

export const EditMessageParamsSchema = z.object({
  channel: z
    .string()
    .min(1, "Channel is required")
    .describe("Channel ID where the message was posted"),
  ts: z
    .string()
    .min(1, "Message timestamp is required")
    .describe("Timestamp of the message to edit (e.g. 1234567890.123456)"),
  text: z
    .string()
    .min(1, "New message text is required")
    .describe("New message content (supports Slack mrkdwn)"),
});

export const DeleteMessageParamsSchema = z.object({
  channel: z
    .string()
    .min(1, "Channel is required")
    .describe("Channel ID where the message was posted"),
  ts: z
    .string()
    .min(1, "Message timestamp is required")
    .describe("Timestamp of the message to delete (e.g. 1234567890.123456)"),
});

export const AddReactionParamsSchema = z.object({
  channel: z
    .string()
    .min(1, "Channel is required")
    .describe("Channel ID where the message was posted"),
  ts: z
    .string()
    .min(1, "Message timestamp is required")
    .describe("Timestamp of the message to react to (e.g. 1234567890.123456)"),
  emoji: z
    .string()
    .min(1, "Emoji name is required")
    .describe("Emoji name without colons (e.g. thumbsup, heart, eyes, white_check_mark)"),
});

export const RemoveReactionParamsSchema = z.object({
  channel: z
    .string()
    .min(1, "Channel is required")
    .describe("Channel ID where the message was posted"),
  ts: z
    .string()
    .min(1, "Message timestamp is required")
    .describe("Timestamp of the message to remove reaction from"),
  emoji: z
    .string()
    .min(1, "Emoji name is required")
    .describe("Emoji name without colons (e.g. thumbsup, heart, eyes)"),
});

export const GetUserInfoParamsSchema = z.object({
  user: z
    .string()
    .min(1, "User identifier is required")
    .describe("User ID, email, display name, or real name to look up"),
});

export type SearchUsersParams = z.infer<typeof SearchUsersParamsSchema>;
export type GetUserProfileParams = z.infer<typeof GetUserProfileParamsSchema>;
export type GetUserInfoParams = z.infer<typeof GetUserInfoParamsSchema>;
export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;
export type SendDmParams = z.infer<typeof SendDmParamsSchema>;
export type GetDmHistoryParams = z.infer<typeof GetDmHistoryParamsSchema>;
export type AnalyzeWritingStyleParams = z.infer<typeof AnalyzeWritingStyleParamsSchema>;
export type GetThreadFromLinkParams = z.infer<typeof GetThreadFromLinkParamsSchema>;
export type TranscribeAudioParams = z.infer<typeof TranscribeAudioParamsSchema>;
export type AnalyzeImageParams = z.infer<typeof AnalyzeImageParamsSchema>;
export type GetFileInfoParams = z.infer<typeof GetFileInfoParamsSchema>;
export type DownloadFileParams = z.infer<typeof DownloadFileParamsSchema>;
export type SendFileParams = z.infer<typeof SendFileParamsSchema>;
export type SendChannelMessageParams = z.infer<typeof SendChannelMessageParamsSchema>;
export type SendAudioParams = z.infer<typeof SendAudioParamsSchema>;
export type SendImageParams = z.infer<typeof SendImageParamsSchema>;
export type EditMessageParams = z.infer<typeof EditMessageParamsSchema>;
export type DeleteMessageParams = z.infer<typeof DeleteMessageParamsSchema>;
export type AddReactionParams = z.infer<typeof AddReactionParamsSchema>;
export type RemoveReactionParams = z.infer<typeof RemoveReactionParamsSchema>;

export type McpTextContent = {
  type: "text";
  text: string;
};

export type McpImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<McpTextContent | McpImageContent>;
}

export class SlackAdvancedMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "SlackAdvancedMCPError";
  }
}

export interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  display_name?: string;
  email?: string;
  title?: string;
  status_text?: string;
  status_emoji?: string;
  timezone?: string;
  image_72?: string;
  is_bot?: boolean;
  deleted?: boolean;
}

export interface SlackMessage {
  type: string;
  user?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  files?: SlackFile[];
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  filetype: string;
  size: number;
  url_private: string;
  url_private_download?: string;
  permalink: string;
}

export interface WritingStyleProfile {
  user_id: string;
  user_name: string;
  messages_analyzed: number;
  avg_message_length: number;
  median_message_length: number;
  emoji_frequency: number;
  top_emojis: string[];
  uses_code_blocks: boolean;
  code_block_frequency: number;
  punctuation_style: {
    ends_with_period: number;
    ends_with_exclamation: number;
    ends_with_question: number;
    no_punctuation: number;
  };
  capitalization: {
    all_lowercase: number;
    starts_uppercase: number;
    mixed: number;
  };
  avg_words_per_message: number;
  vocabulary_richness: number;
  top_words: Array<{ word: string; count: number }>;
  formality_score: number;
  response_patterns: {
    avg_response_time_seconds?: number;
    messages_in_threads: number;
    messages_in_channels: number;
  };
}
