import { z } from "zod";

export interface SlackConfig {
  botToken: string;
  channel: string;
  agentIdentity: string;
  messageTemplate: string;
}

export interface SlackMessage {
  ts: string;
  threadTs?: string;
  user: string;
  text: string;
  botId?: string;
}

export interface ThreadInfo {
  ts: string;
  topic: string;
  lastReply?: string;
  replyCount: number;
  participants: string[];
}

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export const OpenThreadParamsSchema = z.object({
  topic: z.string().describe("Topic or subject for the new thread"),
  message: z.string().optional().describe("Optional initial message body. If omitted, the topic is used as the message"),
});

export const ReplyToThreadParamsSchema = z.object({
  thread_ts: z.string().describe("Timestamp of the parent thread message"),
  message: z.string().describe("Message to post in the thread"),
});

export const ReadThreadParamsSchema = z.object({
  thread_ts: z.string().describe("Timestamp of the parent thread message"),
  since: z.string().optional().describe("Only return messages after this timestamp"),
  limit: z.number().optional().default(50).describe("Max number of messages to return"),
});

export const ListThreadsParamsSchema = z.object({
  limit: z.number().optional().default(10).describe("Max number of threads to return"),
});

export const FindThreadParamsSchema = z.object({
  query: z.string().describe("Search query to find threads by topic or content"),
});

export type OpenThreadParams = z.infer<typeof OpenThreadParamsSchema>;
export type ReplyToThreadParams = z.infer<typeof ReplyToThreadParamsSchema>;
export type ReadThreadParams = z.infer<typeof ReadThreadParamsSchema>;
export type ListThreadsParams = z.infer<typeof ListThreadsParamsSchema>;
export type FindThreadParams = z.infer<typeof FindThreadParamsSchema>;
