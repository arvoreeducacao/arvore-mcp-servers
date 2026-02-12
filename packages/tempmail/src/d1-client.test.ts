import { describe, it, expect, beforeEach, vi } from "vitest";
import { D1DatabaseClient } from "./d1-client.js";

const CONFIG = {
  accountId: "test-account-id",
  databaseId: "test-db-id",
  apiToken: "test-token",
};

const EXPECTED_URL = `https://api.cloudflare.com/client/v4/accounts/${CONFIG.accountId}/d1/database/${CONFIG.databaseId}/query`;

function mockD1Response(results: unknown[], changes = 0) {
  return {
    result: [
      {
        results,
        success: true,
        meta: { changes, duration: 0.1 },
      },
    ],
    success: true,
    errors: [],
    messages: [],
  };
}

describe("D1DatabaseClient", () => {
  let client: D1DatabaseClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new D1DatabaseClient(CONFIG);
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  describe("createAccount", () => {
    it("should create an account via D1 API", async () => {
      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockD1Response([])))
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockD1Response([], 1)))
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify(
              mockD1Response([
                {
                  id: "uuid-123",
                  address: "user@test.com",
                  username: "user",
                  domain: "test.com",
                  is_active: 1,
                  created_at: "2026-01-01",
                },
              ])
            )
          )
        );

      const account = await client.createAccount("user", "test.com");

      expect(account.address).toBe("user@test.com");
      expect(account.is_active).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      const firstCall = fetchSpy.mock.calls[0];
      expect(firstCall[0]).toBe(EXPECTED_URL);
      expect(firstCall[1].headers.Authorization).toBe(
        `Bearer ${CONFIG.apiToken}`
      );
    });

    it("should throw when account already exists", async () => {
      const body = JSON.stringify(mockD1Response([{ id: "existing-id" }]));
      fetchSpy.mockImplementation(() =>
        Promise.resolve(new Response(body))
      );

      await expect(
        client.createAccount("user", "test.com")
      ).rejects.toThrow("already exists");
    });
  });

  describe("getAccountById", () => {
    it("should return account when found", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            mockD1Response([
              {
                id: "uuid-123",
                address: "user@test.com",
                username: "user",
                domain: "test.com",
                is_active: 1,
                created_at: "2026-01-01",
              },
            ])
          )
        )
      );

      const account = await client.getAccountById("uuid-123");

      expect(account).not.toBeNull();
      expect(account!.address).toBe("user@test.com");
      expect(account!.is_active).toBe(true);
    });

    it("should return null when not found", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockD1Response([])))
      );

      const account = await client.getAccountById("nonexistent");

      expect(account).toBeNull();
    });
  });

  describe("listAccounts", () => {
    it("should return paginated accounts", async () => {
      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockD1Response([{ count: 2 }])))
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify(
              mockD1Response([
                {
                  id: "1",
                  address: "a@test.com",
                  username: "a",
                  domain: "test.com",
                  is_active: 1,
                  created_at: "2026-01-01",
                },
                {
                  id: "2",
                  address: "b@test.com",
                  username: "b",
                  domain: "test.com",
                  is_active: 1,
                  created_at: "2026-01-01",
                },
              ])
            )
          )
        );

      const result = await client.listAccounts(1, 20);

      expect(result.total).toBe(2);
      expect(result.accounts).toHaveLength(2);
      expect(result.accounts[0].is_active).toBe(true);
    });
  });

  describe("deleteAccount", () => {
    it("should delete account and its messages", async () => {
      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockD1Response([], 1)))
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockD1Response([], 1)))
        );

      await expect(client.deleteAccount("uuid-123")).resolves.toBeUndefined();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("should throw when account not found", async () => {
      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockD1Response([], 0)))
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockD1Response([], 0)))
        );

      await expect(client.deleteAccount("fake-id")).rejects.toThrow(
        "not found"
      );
    });
  });

  describe("getMessageById", () => {
    it("should return message and mark as seen", async () => {
      fetchSpy
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify(
              mockD1Response([
                {
                  id: "msg-1",
                  account_id: "acc-1",
                  from_address: "sender@test.com",
                  from_name: "Sender",
                  to_address: "user@test.com",
                  subject: "Hello",
                  text: "Body text",
                  html: "<p>Body</p>",
                  has_attachments: 0,
                  size: 100,
                  seen: 0,
                  created_at: "2026-01-01",
                },
              ])
            )
          )
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockD1Response([], 1)))
        );

      const message = await client.getMessageById("msg-1");

      expect(message).not.toBeNull();
      expect(message!.subject).toBe("Hello");
      expect(message!.text).toBe("Body text");
      expect(message!.seen).toBe(true);
    });

    it("should return null when not found", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockD1Response([])))
      );

      const message = await client.getMessageById("fake");

      expect(message).toBeNull();
    });

    it("should parse raw email when text/html are empty", async () => {
      const rawEmail = [
        "From: Raw Sender <raw@test.com>",
        "To: user@test.com",
        "Subject: Raw Subject",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Raw body content",
      ].join("\r\n");

      fetchSpy
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify(
              mockD1Response([
                {
                  id: "msg-raw",
                  account_id: "acc-1",
                  from_address: "raw@test.com",
                  from_name: "",
                  to_address: "user@test.com",
                  subject: "Raw Subject",
                  text: "",
                  html: "",
                  raw: rawEmail,
                  has_attachments: 0,
                  size: 100,
                  seen: 0,
                  created_at: "2026-01-01",
                },
              ])
            )
          )
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockD1Response([], 1)))
        );

      const message = await client.getMessageById("msg-raw");

      expect(message).not.toBeNull();
      expect(message!.text).toContain("Raw body content");
      expect(message!.from_name).toBe("Raw Sender");
    });
  });

  describe("getInbox", () => {
    it("should return paginated messages", async () => {
      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify(mockD1Response([{ count: 1 }])))
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify(
              mockD1Response([
                {
                  id: "msg-1",
                  account_id: "acc-1",
                  from_address: "sender@test.com",
                  from_name: "Sender",
                  to_address: "user@test.com",
                  subject: "Inbox Item",
                  text: "Preview text here",
                  has_attachments: 0,
                  size: 50,
                  seen: 0,
                  created_at: "2026-01-01",
                },
              ])
            )
          )
        );

      const result = await client.getInbox("acc-1", 1, 20);

      expect(result.total).toBe(1);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].subject).toBe("Inbox Item");
    });
  });

  describe("deleteMessage", () => {
    it("should delete a message", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockD1Response([], 1)))
      );

      await expect(client.deleteMessage("msg-1")).resolves.toBeUndefined();
    });

    it("should throw when message not found", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockD1Response([], 0)))
      );

      await expect(client.deleteMessage("fake")).rejects.toThrow("not found");
    });
  });

  describe("API error handling", () => {
    it("should throw on HTTP error", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 })
      );

      await expect(client.getAccountById("test")).rejects.toThrow(
        "D1 API error"
      );
    });

    it("should throw on D1 query error", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: [],
            success: false,
            errors: [{ message: "SQL syntax error" }],
          })
        )
      );

      await expect(client.getAccountById("test")).rejects.toThrow(
        "SQL syntax error"
      );
    });
  });
});
