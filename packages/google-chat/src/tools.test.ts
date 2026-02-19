import { describe, it, expect, vi, beforeEach } from "vitest";
import { GoogleChatMCPTools } from "./tools.js";
import { GoogleChatClient } from "./client.js";

vi.mock("./client.js");

function createMockClient(): GoogleChatClient {
  return {
    listSpaces: vi.fn(),
    getSpace: vi.fn(),
    listMembers: vi.fn(),
    listMessages: vi.fn(),
    getMessage: vi.fn(),
    createMessage: vi.fn(),
    deleteMessage: vi.fn(),
  } as unknown as GoogleChatClient;
}

function parseToolResult(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe("GoogleChatMCPTools", () => {
  let client: GoogleChatClient;
  let tools: GoogleChatMCPTools;

  beforeEach(() => {
    client = createMockClient();
    tools = new GoogleChatMCPTools(client);
  });

  describe("listSpaces", () => {
    it("should return formatted spaces list", async () => {
      vi.mocked(client.listSpaces).mockResolvedValue({
        spaces: [
          {
            name: "spaces/AAA",
            displayName: "General",
            spaceType: "SPACE",
            type: "ROOM",
            spaceThreadingState: "THREADED_MESSAGES",
            externalUserAllowed: false,
            membershipCount: { joinedDirectHumanUserCount: 5 },
          },
        ],
        nextPageToken: "next_page",
      });

      const result = await tools.listSpaces({ pageSize: 100 });
      const data = parseToolResult(result);

      expect(data.spaces).toHaveLength(1);
      expect(data.spaces[0].name).toBe("spaces/AAA");
      expect(data.spaces[0].displayName).toBe("General");
      expect(data.spaces[0].threaded).toBe(true);
      expect(data.nextPageToken).toBe("next_page");
    });

    it("should handle empty spaces list", async () => {
      vi.mocked(client.listSpaces).mockResolvedValue({ spaces: [] });

      const result = await tools.listSpaces({ pageSize: 100 });
      const data = parseToolResult(result);

      expect(data.spaces).toHaveLength(0);
      expect(data.totalSpaces).toBe(0);
    });

    it("should handle API errors gracefully", async () => {
      vi.mocked(client.listSpaces).mockRejectedValue(new Error("Network error"));

      const result = await tools.listSpaces({ pageSize: 100 });
      const data = parseToolResult(result);

      expect(data.error).toContain("Network error");
    });
  });

  describe("getSpace", () => {
    it("should return space details", async () => {
      vi.mocked(client.getSpace).mockResolvedValue({
        name: "spaces/AAA",
        displayName: "General",
        spaceType: "SPACE",
      });

      const result = await tools.getSpace({ spaceName: "spaces/AAA" });
      const data = parseToolResult(result);

      expect(data.name).toBe("spaces/AAA");
      expect(data.displayName).toBe("General");
    });
  });

  describe("listMembers", () => {
    it("should return formatted members list", async () => {
      vi.mocked(client.listMembers).mockResolvedValue({
        memberships: [
          {
            name: "spaces/AAA/members/111",
            state: "JOINED",
            role: "ROLE_MEMBER",
            member: { displayName: "John Doe", type: "HUMAN" },
            createTime: "2024-01-01T00:00:00Z",
          },
        ],
      });

      const result = await tools.listMembers({ spaceName: "spaces/AAA", pageSize: 100 });
      const data = parseToolResult(result);

      expect(data.memberships).toHaveLength(1);
      expect(data.memberships[0].state).toBe("JOINED");
      expect(data.totalMembers).toBe(1);
    });
  });

  describe("listMessages", () => {
    it("should return formatted messages list", async () => {
      vi.mocked(client.listMessages).mockResolvedValue({
        messages: [
          {
            name: "spaces/AAA/messages/m1",
            sender: { displayName: "John", type: "HUMAN" },
            createTime: "2024-01-15T10:00:00Z",
            text: "Hello world",
            thread: { name: "spaces/AAA/threads/t1" },
            space: { name: "spaces/AAA" },
          },
        ],
        nextPageToken: "page_2",
      });

      const result = await tools.listMessages({
        spaceName: "AAA",
        pageSize: 25,
        orderBy: "createTime desc",
        showDeleted: false,
      });
      const data = parseToolResult(result);

      expect(data.messages).toHaveLength(1);
      expect(data.messages[0].text).toBe("Hello world");
      expect(data.nextPageToken).toBe("page_2");
    });
  });

  describe("getMessage", () => {
    it("should return full message details", async () => {
      vi.mocked(client.getMessage).mockResolvedValue({
        name: "spaces/AAA/messages/m1",
        sender: { displayName: "John" },
        createTime: "2024-01-15T10:00:00Z",
        text: "Detailed message content",
      });

      const result = await tools.getMessage({ messageName: "spaces/AAA/messages/m1" });
      const data = parseToolResult(result);

      expect(data.text).toBe("Detailed message content");
    });
  });

  describe("createMessage", () => {
    it("should create a message and return result", async () => {
      vi.mocked(client.createMessage).mockResolvedValue({
        name: "spaces/AAA/messages/new1",
        sender: { displayName: "Bot" },
        createTime: "2024-01-15T12:00:00Z",
        text: "Hello from MCP",
        thread: { name: "spaces/AAA/threads/t1" },
        space: { name: "spaces/AAA" },
      });

      const result = await tools.createMessage({
        spaceName: "AAA",
        text: "Hello from MCP",
        messageReplyOption: "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD",
      });
      const data = parseToolResult(result);

      expect(data.success).toBe(true);
      expect(data.message.text).toBe("Hello from MCP");
    });

    it("should pass thread parameters", async () => {
      vi.mocked(client.createMessage).mockResolvedValue({
        name: "spaces/AAA/messages/new2",
        text: "Thread reply",
      });

      await tools.createMessage({
        spaceName: "AAA",
        text: "Thread reply",
        threadKey: "my-thread",
        messageReplyOption: "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD",
      });

      expect(client.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({ threadKey: "my-thread" })
      );
    });
  });

  describe("deleteMessage", () => {
    it("should delete a message and return success", async () => {
      vi.mocked(client.deleteMessage).mockResolvedValue({});

      const result = await tools.deleteMessage({ messageName: "spaces/AAA/messages/m1" });
      const data = parseToolResult(result);

      expect(data.success).toBe(true);
      expect(data.message).toContain("deleted successfully");
    });

    it("should handle deletion errors gracefully", async () => {
      vi.mocked(client.deleteMessage).mockRejectedValue(new Error("Permission denied"));

      const result = await tools.deleteMessage({ messageName: "spaces/AAA/messages/m1" });
      const data = parseToolResult(result);

      expect(data.error).toContain("Permission denied");
    });
  });
});
