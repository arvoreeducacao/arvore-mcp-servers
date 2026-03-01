import { describe, it, expect, vi, beforeEach } from "vitest";
import { SendGridMCPTools } from "./tools.js";
import { SendGridClient } from "./sendgrid-client.js";

vi.mock("./sendgrid-client.js");

describe("SendGridMCPTools", () => {
  let tools: SendGridMCPTools;
  let client: SendGridClient;

  beforeEach(() => {
    client = new SendGridClient("fake-key");
    client.request = vi.fn();
    tools = new SendGridMCPTools(client);
  });

  describe("listTemplates", () => {
    it("should call GET /templates with query params", async () => {
      const mockData = { templates: [], _metadata: {} };
      vi.mocked(client.request).mockResolvedValue(mockData);

      const result = await tools.listTemplates({ generations: "dynamic", pageSize: 10 });

      expect(client.request).toHaveBeenCalledWith("GET", "/templates", undefined, {
        generations: "dynamic",
        page_size: "10",
      });
      expect(result.content[0].type).toBe("text");
      expect(JSON.parse(result.content[0].text)).toEqual(mockData);
    });

    it("should include pageToken when provided", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      await tools.listTemplates({ generations: "dynamic", pageSize: 20, pageToken: "abc123" });

      expect(client.request).toHaveBeenCalledWith("GET", "/templates", undefined, {
        generations: "dynamic",
        page_size: "20",
        page_token: "abc123",
      });
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(client.request).mockRejectedValue(new Error("Network error"));

      const result = await tools.listTemplates({ generations: "dynamic", pageSize: 20 });

      expect(JSON.parse(result.content[0].text).error).toContain("Network error");
    });
  });

  describe("getTemplate", () => {
    it("should call GET /templates/:id", async () => {
      const mockTemplate = { id: "t1", name: "Test" };
      vi.mocked(client.request).mockResolvedValue(mockTemplate);

      const result = await tools.getTemplate({ templateId: "t1" });

      expect(client.request).toHaveBeenCalledWith("GET", "/templates/t1");
      expect(JSON.parse(result.content[0].text)).toEqual(mockTemplate);
    });
  });

  describe("createTemplate", () => {
    it("should call POST /templates", async () => {
      vi.mocked(client.request).mockResolvedValue({ id: "new-t" });

      await tools.createTemplate({ name: "My Template", generation: "dynamic" });

      expect(client.request).toHaveBeenCalledWith("POST", "/templates", {
        name: "My Template",
        generation: "dynamic",
      });
    });
  });

  describe("updateTemplate", () => {
    it("should call PATCH /templates/:id", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      await tools.updateTemplate({ templateId: "t1", name: "Updated" });

      expect(client.request).toHaveBeenCalledWith("PATCH", "/templates/t1", { name: "Updated" });
    });
  });

  describe("deleteTemplate", () => {
    it("should call DELETE /templates/:id", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      const result = await tools.deleteTemplate({ templateId: "t1" });

      expect(client.request).toHaveBeenCalledWith("DELETE", "/templates/t1");
      expect(JSON.parse(result.content[0].text).success).toBe(true);
    });
  });

  describe("createVersion", () => {
    it("should call POST /templates/:id/versions", async () => {
      vi.mocked(client.request).mockResolvedValue({ id: "v1" });

      await tools.createVersion({
        templateId: "t1",
        name: "v1",
        subject: "Hello {{name}}",
        htmlContent: "<h1>Hi</h1>",
        active: 1,
      });

      expect(client.request).toHaveBeenCalledWith("POST", "/templates/t1/versions", {
        name: "v1",
        subject: "Hello {{name}}",
        html_content: "<h1>Hi</h1>",
        active: 1,
      });
    });
  });

  describe("getVersion", () => {
    it("should call GET /templates/:tid/versions/:vid", async () => {
      vi.mocked(client.request).mockResolvedValue({ id: "v1" });

      await tools.getVersion({ templateId: "t1", versionId: "v1" });

      expect(client.request).toHaveBeenCalledWith("GET", "/templates/t1/versions/v1");
    });
  });

  describe("updateVersion", () => {
    it("should only send provided fields", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      await tools.updateVersion({
        templateId: "t1",
        versionId: "v1",
        subject: "New subject",
      });

      expect(client.request).toHaveBeenCalledWith("PATCH", "/templates/t1/versions/v1", {
        subject: "New subject",
      });
    });
  });

  describe("deleteVersion", () => {
    it("should call DELETE /templates/:tid/versions/:vid", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      const result = await tools.deleteVersion({ templateId: "t1", versionId: "v1" });

      expect(client.request).toHaveBeenCalledWith("DELETE", "/templates/t1/versions/v1");
      expect(JSON.parse(result.content[0].text).success).toBe(true);
    });
  });

  describe("activateVersion", () => {
    it("should call POST /templates/:tid/versions/:vid/activate", async () => {
      vi.mocked(client.request).mockResolvedValue({});

      await tools.activateVersion({ templateId: "t1", versionId: "v1" });

      expect(client.request).toHaveBeenCalledWith("POST", "/templates/t1/versions/v1/activate");
    });
  });
});
