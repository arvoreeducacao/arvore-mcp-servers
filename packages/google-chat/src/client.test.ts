import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleChatClient } from "./client.js";
import { GoogleChatMCPError } from "./types.js";

vi.mock("node:crypto", () => ({
  createSign: () => ({
    update: vi.fn(),
    sign: () => "mocked-signature",
  }),
}));

const FAKE_SERVICE_ACCOUNT = JSON.stringify({
  type: "service_account",
  project_id: "test-project",
  private_key_id: "fake-key-id",
  private_key: "fake-private-key",
  client_email: "test@test-project.iam.gserviceaccount.com",
  client_id: "123456789",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
});

function mockFetchResponses(
  responses: Array<{ ok: boolean; status: number; body: unknown }>
) {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    return {
      ok: resp.ok,
      status: resp.status,
      json: async () => resp.body,
      text: async () => JSON.stringify(resp.body),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const TOKEN_RESPONSE = {
  ok: true,
  status: 200,
  body: { access_token: "tok_123", token_type: "Bearer", expires_in: 3600 },
};

describe("GoogleChatClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("authentication", () => {
    it("should throw when no credentials are provided", async () => {
      const client = new GoogleChatClient({});

      await expect(client.listSpaces({})).rejects.toThrow(
        "No credentials provided"
      );
    });

    it("should exchange JWT for access token using credentials JSON", async () => {
      globalThis.fetch = mockFetchResponses([
        TOKEN_RESPONSE,
        { ok: true, status: 200, body: { spaces: [] } },
      ]);

      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });
      await client.listSpaces({});

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      const firstCall = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(firstCall[0]).toBe("https://oauth2.googleapis.com/token");
    });

    it("should throw on token exchange failure", async () => {
      globalThis.fetch = mockFetchResponses([
        { ok: false, status: 401, body: { error: "invalid_grant" } },
      ]);

      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });

      await expect(client.listSpaces({})).rejects.toThrow(
        "Token exchange failed"
      );
    });

    it("should reuse cached token on subsequent requests", async () => {
      globalThis.fetch = mockFetchResponses([
        TOKEN_RESPONSE,
        { ok: true, status: 200, body: { spaces: [] } },
        {
          ok: true,
          status: 200,
          body: { spaces: [{ name: "spaces/AAA" }] },
        },
      ]);

      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });
      await client.listSpaces({});
      await client.listSpaces({});

      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it("should use bot scopes when userEmail is not provided", async () => {
      globalThis.fetch = mockFetchResponses([
        TOKEN_RESPONSE,
        { ok: true, status: 200, body: { spaces: [] } },
      ]);

      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });
      await client.listSpaces({});

      const tokenCall = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = tokenCall[1]?.body as URLSearchParams;
      const assertion = body.get("assertion") || "";
      const payloadB64 = assertion.split(".")[1];
      const payload = JSON.parse(
        Buffer.from(payloadB64, "base64url").toString()
      );

      expect(payload.scope).toContain("chat.bot");
      expect(payload.sub).toBeUndefined();
    });

    it("should use user scopes and sub claim when userEmail is provided", async () => {
      globalThis.fetch = mockFetchResponses([
        TOKEN_RESPONSE,
        { ok: true, status: 200, body: { spaces: [] } },
      ]);

      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
        userEmail: "admin@example.com",
      });
      await client.listSpaces({});

      const tokenCall = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = tokenCall[1]?.body as URLSearchParams;
      const assertion = body.get("assertion") || "";
      const payloadB64 = assertion.split(".")[1];
      const payload = JSON.parse(
        Buffer.from(payloadB64, "base64url").toString()
      );

      expect(payload.scope).toContain("chat.spaces.readonly");
      expect(payload.sub).toBe("admin@example.com");
    });
  });

  describe("listSpaces", () => {
    beforeEach(() => {
      globalThis.fetch = mockFetchResponses([
        TOKEN_RESPONSE,
        {
          ok: true,
          status: 200,
          body: {
            spaces: [
              {
                name: "spaces/AAA",
                displayName: "General",
                spaceType: "SPACE",
              },
              {
                name: "spaces/BBB",
                displayName: "DM",
                spaceType: "DIRECT_MESSAGE",
              },
            ],
            nextPageToken: "next_123",
          },
        },
      ]);
    });

    it("should list spaces", async () => {
      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });
      const result = await client.listSpaces({});

      expect(result.spaces).toHaveLength(2);
      expect(result.spaces[0].name).toBe("spaces/AAA");
      expect(result.nextPageToken).toBe("next_123");
    });

    it("should pass query parameters", async () => {
      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });
      await client.listSpaces({
        pageSize: 50,
        filter: 'spaceType = "SPACE"',
      });

      const apiCall = vi.mocked(globalThis.fetch).mock.calls[1];
      const url = apiCall[0] as string;

      expect(url).toContain("pageSize=50");
      expect(url).toContain("filter=");
    });
  });

  describe("getSpace", () => {
    beforeEach(() => {
      globalThis.fetch = mockFetchResponses([
        TOKEN_RESPONSE,
        {
          ok: true,
          status: 200,
          body: {
            name: "spaces/AAA",
            displayName: "General",
            spaceType: "SPACE",
          },
        },
      ]);
    });

    it("should get space by full name", async () => {
      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });
      const result = await client.getSpace("spaces/AAA");

      expect(result.name).toBe("spaces/AAA");
    });

    it("should normalize space ID to full name", async () => {
      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });
      await client.getSpace("AAA");

      const apiCall = vi.mocked(globalThis.fetch).mock.calls[1];
      const url = apiCall[0] as string;

      expect(url).toContain("/spaces/AAA");
    });
  });

  describe("listMembers", () => {
    beforeEach(() => {
      globalThis.fetch = mockFetchResponses([
        TOKEN_RESPONSE,
        {
          ok: true,
          status: 200,
          body: {
            memberships: [
              {
                name: "spaces/AAA/members/111",
                state: "JOINED",
                member: { displayName: "User 1" },
              },
            ],
          },
        },
      ]);
    });

    it("should list members of a space", async () => {
      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });
      const result = await client.listMembers({ spaceName: "spaces/AAA" });

      expect(result.memberships).toHaveLength(1);
      expect(result.memberships[0].state).toBe("JOINED");
    });
  });

  describe("listMessages", () => {
    beforeEach(() => {
      globalThis.fetch = mockFetchResponses([
        TOKEN_RESPONSE,
        {
          ok: true,
          status: 200,
          body: {
            messages: [
              {
                name: "spaces/AAA/messages/m1",
                text: "Hello",
                sender: { displayName: "User 1" },
              },
            ],
          },
        },
      ]);
    });

    it("should list messages in a space", async () => {
      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });
      const result = await client.listMessages({ spaceName: "spaces/AAA" });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text).toBe("Hello");
    });

    it("should pass filter and orderBy parameters", async () => {
      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });
      await client.listMessages({
        spaceName: "AAA",
        filter: 'createTime > "2024-01-01T00:00:00Z"',
        orderBy: "createTime asc",
      });

      const apiCall = vi.mocked(globalThis.fetch).mock.calls[1];
      const url = apiCall[0] as string;

      expect(url).toContain("filter=");
      expect(url).toContain("orderBy=");
    });
  });

  describe("createMessage", () => {
    beforeEach(() => {
      globalThis.fetch = mockFetchResponses([
        TOKEN_RESPONSE,
        {
          ok: true,
          status: 200,
          body: {
            name: "spaces/AAA/messages/new1",
            text: "Hello from MCP",
            sender: { displayName: "Bot" },
          },
        },
      ]);
    });

    it("should create a message", async () => {
      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });
      const result = await client.createMessage({
        spaceName: "spaces/AAA",
        text: "Hello from MCP",
      });

      expect(result.text).toBe("Hello from MCP");

      const apiCall = vi.mocked(globalThis.fetch).mock.calls[1];
      expect(apiCall[1]?.method).toBe("POST");
    });

    it("should include thread info when threadKey is provided", async () => {
      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });
      await client.createMessage({
        spaceName: "AAA",
        text: "Reply",
        threadKey: "my-thread",
      });

      const apiCall = vi.mocked(globalThis.fetch).mock.calls[1];
      const body = JSON.parse(apiCall[1]?.body as string);

      expect(body.thread.threadKey).toBe("my-thread");
    });
  });

  describe("deleteMessage", () => {
    beforeEach(() => {
      globalThis.fetch = mockFetchResponses([
        TOKEN_RESPONSE,
        { ok: true, status: 204, body: {} },
      ]);
    });

    it("should delete a message", async () => {
      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });
      await client.deleteMessage("spaces/AAA/messages/m1");

      const apiCall = vi.mocked(globalThis.fetch).mock.calls[1];
      expect(apiCall[1]?.method).toBe("DELETE");
    });
  });

  describe("API error handling", () => {
    it("should throw GoogleChatMCPError on API errors", async () => {
      globalThis.fetch = mockFetchResponses([
        TOKEN_RESPONSE,
        {
          ok: false,
          status: 404,
          body: { error: { message: "Space not found" } },
        },
      ]);

      const client = new GoogleChatClient({
        credentialsJson: FAKE_SERVICE_ACCOUNT,
      });

      await expect(client.getSpace("spaces/INVALID")).rejects.toThrow(
        GoogleChatMCPError
      );
    });
  });
});
