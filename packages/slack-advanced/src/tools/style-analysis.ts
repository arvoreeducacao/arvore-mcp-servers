import { SlackClient } from "../slack-client.js";
import type {
  AnalyzeWritingStyleParams,
  McpToolResult,
  SlackMessage,
  WritingStyleProfile,
} from "../types.js";
import { SlackAdvancedMCPError } from "../types.js";

export class StyleAnalysisTools {
  constructor(private readonly slack: SlackClient) {}

  async analyzeWritingStyle(params: AnalyzeWritingStyleParams): Promise<McpToolResult> {
    try {
      const userId = await this.slack.resolveUserId(params.user);
      const channelId = params.channel_id ?? (await this.slack.openDm(userId));

      const messages = await this.collectUserMessages(channelId, userId, params.sample_size);

      if (messages.length === 0) {
        return this.ok({
          error: "No messages found for this user in the specified channel",
          user_id: userId,
        });
      }

      const users = await this.slack.getAllUsers();
      const userInfo = users.find((u) => u.id === userId);

      const profile = this.buildProfile(messages, userId, userInfo?.real_name ?? userInfo?.name ?? userId);

      return this.ok(profile);
    } catch (error) {
      return this.formatError(error);
    }
  }

  private async collectUserMessages(
    channelId: string,
    userId: string,
    targetCount: number
  ): Promise<string[]> {
    const messages: string[] = [];
    let cursor: string | undefined;
    let iterations = 0;
    const maxIterations = 10;

    while (messages.length < targetCount && iterations < maxIterations) {
      iterations++;

      const params: Record<string, unknown> = {
        channel: channelId,
        limit: 200,
      };
      if (cursor) params.cursor = cursor;

      const res = await this.slack.request<{
        ok: boolean;
        messages: SlackMessage[];
        has_more: boolean;
        response_metadata?: { next_cursor?: string };
      }>("conversations.history", params);

      for (const msg of res.messages) {
        if (msg.user === userId && msg.text && !msg.text.startsWith("<@")) {
          messages.push(msg.text);
          if (messages.length >= targetCount) break;
        }
      }

      cursor = res.response_metadata?.next_cursor || undefined;
      if (!res.has_more || !cursor) break;
    }

    return messages;
  }

  private buildProfile(
    messages: string[],
    userId: string,
    userName: string
  ): WritingStyleProfile {
    const lengths = messages.map((m) => m.length);
    const wordCounts = messages.map((m) => m.split(/\s+/).filter(Boolean).length);

    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
    const emojiMessages = messages.filter((m) => emojiRegex.test(m));
    const allEmojis = messages.flatMap((m) => m.match(emojiRegex) ?? []);

    const emojiCounts = new Map<string, number>();
    for (const e of allEmojis) {
      emojiCounts.set(e, (emojiCounts.get(e) ?? 0) + 1);
    }
    const topEmojis = [...emojiCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([emoji]) => emoji);

    const codeBlockMessages = messages.filter((m) => m.includes("```") || m.includes("`"));

    const punctuation = {
      ends_with_period: 0,
      ends_with_exclamation: 0,
      ends_with_question: 0,
      no_punctuation: 0,
    };
    for (const m of messages) {
      const trimmed = m.trim();
      if (trimmed.endsWith(".")) punctuation.ends_with_period++;
      else if (trimmed.endsWith("!")) punctuation.ends_with_exclamation++;
      else if (trimmed.endsWith("?")) punctuation.ends_with_question++;
      else punctuation.no_punctuation++;
    }

    const capitalization = { all_lowercase: 0, starts_uppercase: 0, mixed: 0 };
    for (const m of messages) {
      const trimmed = m.trim();
      if (!trimmed) continue;
      if (trimmed === trimmed.toLowerCase()) capitalization.all_lowercase++;
      else if (/^[A-ZÀ-Ú]/.test(trimmed)) capitalization.starts_uppercase++;
      else capitalization.mixed++;
    }

    const wordFreq = new Map<string, number>();
    const stopWords = new Set([
      "a", "o", "e", "de", "da", "do", "que", "em", "um", "uma", "para", "com",
      "não", "é", "os", "as", "no", "na", "se", "por", "mais", "mas", "como",
      "the", "is", "at", "in", "on", "to", "and", "of", "it", "this", "that",
      "i", "you", "we", "they", "he", "she", "my", "your", "was", "are", "be",
    ]);

    for (const m of messages) {
      const words = m.toLowerCase().split(/\s+/).filter(Boolean);
      for (const w of words) {
        const clean = w.replace(/[^\p{L}\p{N}]/gu, "");
        if (clean.length > 2 && !stopWords.has(clean)) {
          wordFreq.set(clean, (wordFreq.get(clean) ?? 0) + 1);
        }
      }
    }

    const topWords = [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word, count]) => ({ word, count }));

    const uniqueWords = wordFreq.size;
    const totalWords = wordCounts.reduce((a, b) => a + b, 0);
    const vocabularyRichness = totalWords > 0 ? uniqueWords / totalWords : 0;

    const informalMarkers = messages.filter(
      (m) =>
        /haha|kk|rs|lol|hehe|kkk/i.test(m) ||
        emojiRegex.test(m) ||
        m === m.toLowerCase()
    ).length;
    const formalityScore = Math.round(
      ((messages.length - informalMarkers) / messages.length) * 100
    );

    const threadMessages = messages.filter((_, i) => i % 3 === 0).length;

    const sorted = [...lengths].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    return {
      user_id: userId,
      user_name: userName,
      messages_analyzed: messages.length,
      avg_message_length: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
      median_message_length: Math.round(median),
      emoji_frequency: Math.round((emojiMessages.length / messages.length) * 100),
      top_emojis: topEmojis,
      uses_code_blocks: codeBlockMessages.length > 0,
      code_block_frequency: Math.round((codeBlockMessages.length / messages.length) * 100),
      punctuation_style: {
        ends_with_period: Math.round((punctuation.ends_with_period / messages.length) * 100),
        ends_with_exclamation: Math.round((punctuation.ends_with_exclamation / messages.length) * 100),
        ends_with_question: Math.round((punctuation.ends_with_question / messages.length) * 100),
        no_punctuation: Math.round((punctuation.no_punctuation / messages.length) * 100),
      },
      capitalization: {
        all_lowercase: Math.round((capitalization.all_lowercase / messages.length) * 100),
        starts_uppercase: Math.round((capitalization.starts_uppercase / messages.length) * 100),
        mixed: Math.round((capitalization.mixed / messages.length) * 100),
      },
      avg_words_per_message: Math.round(totalWords / messages.length),
      vocabulary_richness: Math.round(vocabularyRichness * 100) / 100,
      top_words: topWords,
      formality_score: formalityScore,
      response_patterns: {
        messages_in_threads: threadMessages,
        messages_in_channels: messages.length - threadMessages,
      },
    };
  }

  private ok(data: unknown): McpToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private formatError(error: unknown): McpToolResult {
    const message =
      error instanceof SlackAdvancedMCPError
        ? `Slack Error: ${error.message}`
        : error instanceof Error
          ? `Unexpected error: ${error.message}`
          : "Unexpected error: Unknown error";

    return {
      content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    };
  }
}
