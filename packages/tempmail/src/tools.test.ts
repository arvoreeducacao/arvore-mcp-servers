import { describe, it, expect, beforeEach } from "vitest";
import { TempMailMCPTools } from "./tools.js";
import { InMemoryEmailStore } from "./test-store.js";

const TEST_DOMAIN = "test.example.com";

describe("TempMailMCPTools", () => {
  let store: InMemoryEmailStore;
  let tools: TempMailMCPTools;

  beforeEach(() => {
    store = new InMemoryEmailStore();
    tools = new TempMailMCPTools(store, TEST_DOMAIN);
  });

  describe("getDomains", () => {
    it("should return configured domain", () => {
      const result = tools.getDomains();

      expect(result.content).toHaveLength(1);
      const data = JSON.parse(result.content[0].text);
      expect(data.domains).toContain(TEST_DOMAIN);
    });
  });

  describe("createEmailAccount", () => {
    it("should create an account and return details", async () => {
      const result = await tools.createEmailAccount({ username: "testuser" });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.account.address).toBe(`testuser@${TEST_DOMAIN}`);
      expect(data.account.id).toBeTruthy();
    });

    it("should return error for duplicate accounts", async () => {
      await tools.createEmailAccount({ username: "testuser" });
      const result = await tools.createEmailAccount({ username: "testuser" });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("already exists");
    });
  });

  describe("listEmailAccounts", () => {
    it("should list accounts with pagination", async () => {
      await tools.createEmailAccount({ username: "user1" });
      await tools.createEmailAccount({ username: "user2" });

      const result = await tools.listEmailAccounts({ page: 1, limit: 20 });

      const data = JSON.parse(result.content[0].text);
      expect(data.accounts).toHaveLength(2);
      expect(data.total).toBe(2);
    });
  });

  describe("deleteEmailAccount", () => {
    it("should delete an existing account", async () => {
      const createResult = await tools.createEmailAccount({
        username: "testuser",
      });
      const accountId = JSON.parse(createResult.content[0].text).account.id;

      const result = await tools.deleteEmailAccount({ accountId });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });

    it("should return error for non-existent account", async () => {
      const result = await tools.deleteEmailAccount({ accountId: "fake-id" });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });

  describe("getInbox", () => {
    it("should return inbox messages", async () => {
      const createResult = await tools.createEmailAccount({
        username: "testuser",
      });
      const accountId = JSON.parse(createResult.content[0].text).account.id;

      store.createMessage({
        accountId,
        fromAddress: "sender@test.com",
        fromName: "Sender",
        toAddress: `testuser@${TEST_DOMAIN}`,
        subject: "Test Email",
        text: "Hello world content here for testing",
        html: "<p>Hello</p>",
        hasAttachments: false,
        size: 100,
      });

      const result = await tools.getInbox({ accountId, page: 1, limit: 20 });

      const data = JSON.parse(result.content[0].text);
      expect(data.messages).toHaveLength(1);
      expect(data.messages[0].subject).toBe("Test Email");
      expect(data.messages[0].from).toBe("sender@test.com");
    });

    it("should return error for non-existent account", async () => {
      const result = await tools.getInbox({
        accountId: "fake-id",
        page: 1,
        limit: 20,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });

  describe("readEmail", () => {
    it("should return full email content", async () => {
      const createResult = await tools.createEmailAccount({
        username: "testuser",
      });
      const accountId = JSON.parse(createResult.content[0].text).account.id;

      const message = store.createMessage({
        accountId,
        fromAddress: "sender@test.com",
        fromName: "Sender Name",
        toAddress: `testuser@${TEST_DOMAIN}`,
        subject: "Full Content Test",
        text: "Plain text body",
        html: "<h1>HTML body</h1>",
        hasAttachments: true,
        size: 500,
      });

      const result = await tools.readEmail({ messageId: message.id });

      const data = JSON.parse(result.content[0].text);
      expect(data.subject).toBe("Full Content Test");
      expect(data.text).toBe("Plain text body");
      expect(data.html).toBe("<h1>HTML body</h1>");
      expect(data.hasAttachments).toBe(true);
    });

    it("should return error for non-existent message", async () => {
      const result = await tools.readEmail({ messageId: "fake-id" });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });

  describe("deleteEmail", () => {
    it("should delete an existing message", async () => {
      const createResult = await tools.createEmailAccount({
        username: "testuser",
      });
      const accountId = JSON.parse(createResult.content[0].text).account.id;

      const message = store.createMessage({
        accountId,
        fromAddress: "sender@test.com",
        fromName: "Sender",
        toAddress: `testuser@${TEST_DOMAIN}`,
        subject: "To Delete",
        text: "Delete me",
        html: "",
        hasAttachments: false,
        size: 50,
      });

      const result = await tools.deleteEmail({ messageId: message.id });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });

    it("should return error for non-existent message", async () => {
      const result = await tools.deleteEmail({ messageId: "fake-id" });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });
});
