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

export const SendChannelMessageParamsSchema = z.object({
  channel: z
    .string()
    .min(1, "Channel is required")
    .describe("Channel ID (e.g. C07US58UC1Z) or channel name (e.g. #eng-prs)"),
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
});

export type SearchUsersParams = z.infer<typeof SearchUsersParamsSchema>;
export type GetUserProfileParams = z.infer<typeof GetUserProfileParamsSchema>;
export type SendDmParams = z.infer<typeof SendDmParamsSchema>;
export type GetDmHistoryParams = z.infer<typeof GetDmHistoryParamsSchema>;
export type AnalyzeWritingStyleParams = z.infer<typeof AnalyzeWritingStyleParamsSchema>;
export type GetThreadFromLinkParams = z.infer<typeof GetThreadFromLinkParamsSchema>;
export type TranscribeAudioParams = z.infer<typeof TranscribeAudioParamsSchema>;
export type AnalyzeImageParams = z.infer<typeof AnalyzeImageParamsSchema>;
export type GetFileInfoParams = z.infer<typeof GetFileInfoParamsSchema>;
export type SendChannelMessageParams = z.infer<typeof SendChannelMessageParamsSchema>;

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
