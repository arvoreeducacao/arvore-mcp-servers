import {
  CreateEmailAccountParams,
  ListEmailAccountsParams,
  DeleteEmailAccountParams,
  GetInboxParams,
  ReadEmailParams,
  DeleteEmailParams,
  McpToolResult,
  TempMailMCPError,
  type EmailStore,
} from "./types.js";

export class TempMailMCPTools {
  constructor(
    private store: EmailStore,
    private domain: string
  ) {}

  getDomains(): McpToolResult {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              domains: [this.domain],
              info: "Use any of these domains when creating a new email account.",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  async createEmailAccount(
    params: CreateEmailAccountParams
  ): Promise<McpToolResult> {
    try {
      const account = await this.store.createAccount(
        params.username,
        this.domain
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                account: {
                  id: account.id,
                  address: account.address,
                  username: account.username,
                  domain: account.domain,
                  createdAt: account.created_at,
                },
                info: `Email account created. Emails sent to ${account.address} will be received by this server.`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.formatError(error, { username: params.username });
    }
  }

  async listEmailAccounts(
    params: ListEmailAccountsParams
  ): Promise<McpToolResult> {
    try {
      const { accounts, total } = await this.store.listAccounts(
        params.page,
        params.limit
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                accounts: accounts.map((a) => ({
                  id: a.id,
                  address: a.address,
                  createdAt: a.created_at,
                })),
                total,
                page: params.page,
                limit: params.limit,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.formatError(error, {});
    }
  }

  async deleteEmailAccount(
    params: DeleteEmailAccountParams
  ): Promise<McpToolResult> {
    try {
      await this.store.deleteAccount(params.accountId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `Account "${params.accountId}" and all its messages have been deleted.`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.formatError(error, { accountId: params.accountId });
    }
  }

  async getInbox(params: GetInboxParams): Promise<McpToolResult> {
    try {
      const account = await this.store.getAccountById(params.accountId);
      if (!account) {
        throw new TempMailMCPError(
          `Account "${params.accountId}" not found`,
          "NOT_FOUND",
          404
        );
      }

      const { messages, total } = await this.store.getInbox(
        params.accountId,
        params.page,
        params.limit
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                account: account.address,
                messages: messages.map((m) => ({
                  id: m.id,
                  from: m.from_address,
                  fromName: m.from_name,
                  subject: m.subject,
                  preview: m.text.substring(0, 150),
                  hasAttachments: m.has_attachments,
                  seen: m.seen,
                  receivedAt: m.created_at,
                })),
                total,
                page: params.page,
                limit: params.limit,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.formatError(error, { accountId: params.accountId });
    }
  }

  async readEmail(params: ReadEmailParams): Promise<McpToolResult> {
    try {
      const message = await this.store.getMessageById(params.messageId);

      if (!message) {
        throw new TempMailMCPError(
          `Message "${params.messageId}" not found`,
          "NOT_FOUND",
          404
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: message.id,
                from: message.from_address,
                fromName: message.from_name,
                to: message.to_address,
                subject: message.subject,
                text: message.text,
                html: message.html,
                hasAttachments: message.has_attachments,
                size: message.size,
                receivedAt: message.created_at,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.formatError(error, { messageId: params.messageId });
    }
  }

  async deleteEmail(params: DeleteEmailParams): Promise<McpToolResult> {
    try {
      await this.store.deleteMessage(params.messageId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `Message "${params.messageId}" deleted successfully.`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.formatError(error, { messageId: params.messageId });
    }
  }

  private formatError(
    error: unknown,
    context: Record<string, unknown>
  ): McpToolResult {
    const errorMessage =
      error instanceof TempMailMCPError
        ? `TempMail Error: ${error.message}`
        : `Unexpected error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: errorMessage,
              ...context,
            },
            null,
            2
          ),
        },
      ],
    };
  }
}
