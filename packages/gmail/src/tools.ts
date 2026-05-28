import { GmailClient } from "./client.js";
import {
  GmailMCPError,
  McpToolResult,
  MessagesListParams,
  MessagesGetParams,
  MessagesSendParams,
  DraftsCreateParams,
  DraftsListParams,
  DraftsSendParams,
  ThreadsGetParams,
  MessagesModifyParams,
  MessagesTrashParams,
  LabelsListParams,
  ProfileGetParams,
} from "./types.js";

export interface GmailMCPToolsOptions {
  allowSend: boolean;
}

export class GmailMCPTools {
  constructor(
    private client: GmailClient,
    private options: GmailMCPToolsOptions
  ) {}

  async listMessages(params: MessagesListParams): Promise<McpToolResult> {
    try {
      const result = await this.client.listMessages({
        query: params.query,
        labelIds: params.labelIds,
        maxResults: params.maxResults,
        pageToken: params.pageToken,
        includeSpamTrash: params.includeSpamTrash,
      });

      return jsonResult({
        messages: result.messages || [],
        nextPageToken: result.nextPageToken || null,
        resultSizeEstimate: result.resultSizeEstimate || 0,
      });
    } catch (error) {
      return formatError(error, { query: params.query });
    }
  }

  async getMessage(params: MessagesGetParams): Promise<McpToolResult> {
    try {
      const message = await this.client.getMessage(
        params.messageId,
        params.format
      );

      if (params.format === "raw" || params.format === "minimal") {
        return jsonResult(message);
      }

      return jsonResult(this.client.formatMessageForLLM(message));
    } catch (error) {
      return formatError(error, { messageId: params.messageId });
    }
  }

  async sendMessage(params: MessagesSendParams): Promise<McpToolResult> {
    if (!this.options.allowSend) {
      return jsonResult({
        error:
          "Sending is disabled. Set GMAIL_MCP_ALLOW_SEND=true to enable, or use drafts_create instead.",
      });
    }

    try {
      let threadId: string | undefined;
      let inReplyTo: string | undefined;
      let references: string | undefined;
      let subject = params.subject;

      if (params.replyToMessageId) {
        const ctx = await this.client.resolveReplyContext(
          params.replyToMessageId
        );
        threadId = ctx.threadId;
        inReplyTo = ctx.inReplyTo;
        references = ctx.references;
        if (ctx.subject) subject = ctx.subject;
      }

      const message = await this.client.sendMessage({
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        subject,
        body: params.body,
        bodyType: params.bodyType,
        threadId,
        inReplyTo,
        references,
      });

      return jsonResult({
        success: true,
        message: {
          id: message.id,
          threadId: message.threadId,
          labelIds: message.labelIds,
          snippet: message.snippet,
        },
      });
    } catch (error) {
      return formatError(error, {
        to: params.to,
        subject: params.subject,
      });
    }
  }

  async createDraft(params: DraftsCreateParams): Promise<McpToolResult> {
    try {
      let threadId: string | undefined;
      let inReplyTo: string | undefined;
      let references: string | undefined;
      let subject = params.subject;

      if (params.replyToMessageId) {
        const ctx = await this.client.resolveReplyContext(
          params.replyToMessageId
        );
        threadId = ctx.threadId;
        inReplyTo = ctx.inReplyTo;
        references = ctx.references;
        if (ctx.subject) subject = ctx.subject;
      }

      const draft = await this.client.createDraft({
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        subject,
        body: params.body,
        bodyType: params.bodyType,
        threadId,
        inReplyTo,
        references,
      });

      return jsonResult({
        success: true,
        draft: {
          id: draft.id,
          message: draft.message
            ? {
                id: draft.message.id,
                threadId: draft.message.threadId,
              }
            : null,
        },
      });
    } catch (error) {
      return formatError(error, {
        to: params.to,
        subject: params.subject,
      });
    }
  }

  async listDrafts(params: DraftsListParams): Promise<McpToolResult> {
    try {
      const result = await this.client.listDrafts({
        query: params.query,
        maxResults: params.maxResults,
        pageToken: params.pageToken,
      });

      return jsonResult({
        drafts: result.drafts || [],
        nextPageToken: result.nextPageToken || null,
        resultSizeEstimate: result.resultSizeEstimate || 0,
      });
    } catch (error) {
      return formatError(error, { query: params.query });
    }
  }

  async sendDraft(params: DraftsSendParams): Promise<McpToolResult> {
    if (!this.options.allowSend) {
      return jsonResult({
        error:
          "Sending is disabled. Set GMAIL_MCP_ALLOW_SEND=true to enable.",
      });
    }

    try {
      const message = await this.client.sendDraft(params.draftId);
      return jsonResult({
        success: true,
        message: {
          id: message.id,
          threadId: message.threadId,
          labelIds: message.labelIds,
        },
      });
    } catch (error) {
      return formatError(error, { draftId: params.draftId });
    }
  }

  async getThread(params: ThreadsGetParams): Promise<McpToolResult> {
    try {
      const thread = await this.client.getThread(
        params.threadId,
        params.format
      );

      return jsonResult({
        id: thread.id,
        historyId: thread.historyId,
        messages: thread.messages.map((m) =>
          this.client.formatMessageForLLM(m)
        ),
      });
    } catch (error) {
      return formatError(error, { threadId: params.threadId });
    }
  }

  async modifyMessage(params: MessagesModifyParams): Promise<McpToolResult> {
    try {
      const message = await this.client.modifyMessage({
        messageId: params.messageId,
        addLabelIds: params.addLabelIds,
        removeLabelIds: params.removeLabelIds,
      });

      return jsonResult({
        success: true,
        message: {
          id: message.id,
          threadId: message.threadId,
          labelIds: message.labelIds,
        },
      });
    } catch (error) {
      return formatError(error, {
        messageId: params.messageId,
        addLabelIds: params.addLabelIds,
        removeLabelIds: params.removeLabelIds,
      });
    }
  }

  async trashMessage(params: MessagesTrashParams): Promise<McpToolResult> {
    try {
      const message = await this.client.trashMessage(params.messageId);
      return jsonResult({
        success: true,
        message: {
          id: message.id,
          threadId: message.threadId,
          labelIds: message.labelIds,
        },
      });
    } catch (error) {
      return formatError(error, { messageId: params.messageId });
    }
  }

  async listLabels(_params: LabelsListParams): Promise<McpToolResult> {
    try {
      const result = await this.client.listLabels();
      return jsonResult({
        labels: result.labels || [],
        totalLabels: (result.labels || []).length,
      });
    } catch (error) {
      return formatError(error, {});
    }
  }

  async getProfile(_params: ProfileGetParams): Promise<McpToolResult> {
    try {
      const profile = await this.client.getProfile();
      return jsonResult(profile);
    } catch (error) {
      return formatError(error, {});
    }
  }
}

function jsonResult(data: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function formatError(
  error: unknown,
  context: Record<string, unknown>
): McpToolResult {
  const errorMessage =
    error instanceof GmailMCPError
      ? `Gmail Error [${error.code}]: ${error.message}`
      : `Unexpected error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;

  return jsonResult({
    error: errorMessage,
    ...context,
  });
}
