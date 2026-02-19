import { GoogleChatClient } from "./client.js";
import {
  SpacesListParams,
  SpacesGetParams,
  MembersListParams,
  MessagesListParams,
  MessagesGetParams,
  MessagesCreateParams,
  MessagesDeleteParams,
  GoogleChatMCPError,
  McpToolResult,
} from "./types.js";

export class GoogleChatMCPTools {
  constructor(private client: GoogleChatClient) {}

  async listSpaces(params: SpacesListParams): Promise<McpToolResult> {
    try {
      const result = await this.client.listSpaces({
        filter: params.filter,
        pageSize: params.pageSize,
        pageToken: params.pageToken,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                spaces: (result.spaces || []).map((s) => ({
                  name: s.name,
                  displayName: s.displayName,
                  spaceType: s.spaceType,
                  type: s.type,
                  singleUserBotDm: s.singleUserBotDm,
                  threaded: s.spaceThreadingState === "THREADED_MESSAGES",
                  externalUserAllowed: s.externalUserAllowed,
                  membershipCount: s.membershipCount,
                })),
                nextPageToken: result.nextPageToken || null,
                totalSpaces: (result.spaces || []).length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.formatError(error, { filter: params.filter });
    }
  }

  async getSpace(params: SpacesGetParams): Promise<McpToolResult> {
    try {
      const space = await this.client.getSpace(params.spaceName);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(space, null, 2),
          },
        ],
      };
    } catch (error) {
      return this.formatError(error, { spaceName: params.spaceName });
    }
  }

  async listMembers(params: MembersListParams): Promise<McpToolResult> {
    try {
      const result = await this.client.listMembers({
        spaceName: params.spaceName,
        pageSize: params.pageSize,
        pageToken: params.pageToken,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                memberships: (result.memberships || []).map((m) => ({
                  name: m.name,
                  state: m.state,
                  role: m.role,
                  member: m.member,
                  createTime: m.createTime,
                })),
                nextPageToken: result.nextPageToken || null,
                totalMembers: (result.memberships || []).length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.formatError(error, { spaceName: params.spaceName });
    }
  }

  async listMessages(params: MessagesListParams): Promise<McpToolResult> {
    try {
      const result = await this.client.listMessages({
        spaceName: params.spaceName,
        pageSize: params.pageSize,
        pageToken: params.pageToken,
        filter: params.filter,
        orderBy: params.orderBy,
        showDeleted: params.showDeleted,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                messages: (result.messages || []).map((m) => ({
                  name: m.name,
                  sender: m.sender,
                  createTime: m.createTime,
                  lastUpdateTime: m.lastUpdateTime,
                  text: m.text,
                  formattedText: m.formattedText,
                  thread: m.thread,
                  space: m.space,
                  deleteTime: m.deleteTime,
                  deletionMetadata: m.deletionMetadata,
                })),
                nextPageToken: result.nextPageToken || null,
                totalMessages: (result.messages || []).length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.formatError(error, { spaceName: params.spaceName });
    }
  }

  async getMessage(params: MessagesGetParams): Promise<McpToolResult> {
    try {
      const message = await this.client.getMessage(params.messageName);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(message, null, 2),
          },
        ],
      };
    } catch (error) {
      return this.formatError(error, { messageName: params.messageName });
    }
  }

  async createMessage(params: MessagesCreateParams): Promise<McpToolResult> {
    try {
      const message = await this.client.createMessage({
        spaceName: params.spaceName,
        text: params.text,
        threadKey: params.threadKey,
        threadName: params.threadName,
        messageReplyOption: params.messageReplyOption,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: {
                  name: message.name,
                  sender: message.sender,
                  createTime: message.createTime,
                  text: message.text,
                  thread: message.thread,
                  space: message.space,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.formatError(error, {
        spaceName: params.spaceName,
        text: params.text.substring(0, 100),
      });
    }
  }

  async deleteMessage(params: MessagesDeleteParams): Promise<McpToolResult> {
    try {
      await this.client.deleteMessage(params.messageName);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `Message "${params.messageName}" deleted successfully.`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return this.formatError(error, { messageName: params.messageName });
    }
  }

  private formatError(
    error: unknown,
    context: Record<string, unknown>
  ): McpToolResult {
    const errorMessage =
      error instanceof GoogleChatMCPError
        ? `Google Chat Error [${error.code}]: ${error.message}`
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
