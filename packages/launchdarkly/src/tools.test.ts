import { describe, it, expect, vi, beforeEach } from "vitest";
import { LaunchDarklyMCPTools } from "./tools.js";
import { LaunchDarklyClient } from "./launchdarkly-client.js";
import { LaunchDarklyMCPError, LaunchDarklyConfig } from "./types.js";

vi.mock("./launchdarkly-client.js");

function parseResult(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

const config: LaunchDarklyConfig = {
  email: "test@example.com",
  password: "secret",
  baseUrl: "https://app.launchdarkly.com",
  defaultProject: "default",
  defaultEnvironment: "production",
};

describe("LaunchDarklyMCPTools", () => {
  let client: LaunchDarklyClient;
  let tools: LaunchDarklyMCPTools;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new LaunchDarklyClient(config);
    tools = new LaunchDarklyMCPTools(client, config);
  });

  describe("listFlags", () => {
    it("should return flags with resolved project and environment", async () => {
      vi.mocked(client.listFlags).mockResolvedValue({
        items: [{ key: "flag-1" }, { key: "flag-2" }],
        totalCount: 2,
      });

      const result = await tools.listFlags({
        limit: 20,
        offset: 0,
      });

      const data = parseResult(result);
      expect(data.project).toBe("default");
      expect(data.environment).toBe("production");
      expect(data.totalCount).toBe(2);
      expect(data.returned).toBe(2);
    });

    it("should use custom project and environment", async () => {
      vi.mocked(client.listFlags).mockResolvedValue({
        items: [],
        totalCount: 0,
      });

      await tools.listFlags({
        projectKey: "custom",
        environment: "test",
        limit: 10,
        offset: 0,
      });

      expect(client.listFlags).toHaveBeenCalledWith("custom", {
        env: "test",
        limit: 10,
        offset: 0,
        filter: "state:alive",
        sort: undefined,
      });
    });

    it("should handle error gracefully", async () => {
      vi.mocked(client.listFlags).mockRejectedValue(
        new LaunchDarklyMCPError("API Error", "API_ERROR", 500)
      );

      const result = await tools.listFlags({ limit: 20, offset: 0 });
      const data = parseResult(result);

      expect(data.error).toContain("API Error");
      expect(data.projectKey).toBe("default");
    });
  });

  describe("getFlag", () => {
    it("should return flag details", async () => {
      vi.mocked(client.getFlag).mockResolvedValue({
        key: "my-flag",
        name: "My Flag",
      });

      const result = await tools.getFlag({ flagKey: "my-flag" });
      const data = parseResult(result);

      expect(data.flag.key).toBe("my-flag");
      expect(data.project).toBe("default");
    });

    it("should handle not found error", async () => {
      vi.mocked(client.getFlag).mockRejectedValue(
        new LaunchDarklyMCPError("Not found", "API_ERROR", 404)
      );

      const result = await tools.getFlag({ flagKey: "missing" });
      const data = parseResult(result);

      expect(data.error).toContain("Not found");
    });
  });

  describe("toggleFlag", () => {
    it("should toggle flag ON", async () => {
      vi.mocked(client.toggleFlag).mockResolvedValue({ key: "my-flag" });

      const result = await tools.toggleFlag({
        flagKey: "my-flag",
        state: true,
      });
      const data = parseResult(result);

      expect(data.success).toBe(true);
      expect(data.state).toBe(true);
      expect(data.message).toContain("ON");
    });

    it("should toggle flag OFF", async () => {
      vi.mocked(client.toggleFlag).mockResolvedValue({ key: "my-flag" });

      const result = await tools.toggleFlag({
        flagKey: "my-flag",
        state: false,
      });
      const data = parseResult(result);

      expect(data.state).toBe(false);
      expect(data.message).toContain("OFF");
    });
  });

  describe("createFlag", () => {
    it("should create flag and return success", async () => {
      vi.mocked(client.createFlag).mockResolvedValue({
        key: "new-flag",
        name: "New Flag",
      });

      const result = await tools.createFlag({
        name: "New Flag",
        key: "new-flag",
        description: "",
        tags: [],
        temporary: true,
      });
      const data = parseResult(result);

      expect(data.success).toBe(true);
      expect(data.message).toContain("New Flag");
    });
  });

  describe("searchFlags", () => {
    it("should search with query filter", async () => {
      vi.mocked(client.listFlags).mockResolvedValue({
        items: [{ key: "match" }],
        totalCount: 1,
      });

      const result = await tools.searchFlags({
        query: "onboarding",
        limit: 20,
      });
      const data = parseResult(result);

      expect(data.query).toBe("onboarding");
      expect(data.totalCount).toBe(1);

      expect(client.listFlags).toHaveBeenCalledWith("default", {
        env: "production",
        limit: 20,
        filter: "query:onboarding",
      });
    });
  });

  describe("listProjects", () => {
    it("should list projects", async () => {
      vi.mocked(client.listProjects).mockResolvedValue({
        items: [{ key: "proj-1" }],
        totalCount: 1,
      });

      const result = await tools.listProjects();
      const data = parseResult(result);

      expect(data.totalCount).toBe(1);
      expect(data.projects).toHaveLength(1);
    });
  });

  describe("listEnvironments", () => {
    it("should list environments for project", async () => {
      vi.mocked(client.listEnvironments).mockResolvedValue({
        items: [{ key: "production" }, { key: "test" }],
      });

      const result = await tools.listEnvironments({});
      const data = parseResult(result);

      expect(data.project).toBe("default");
      expect(data.environments).toHaveLength(2);
    });
  });

  describe("getFlagStatuses", () => {
    it("should query flag statuses", async () => {
      vi.mocked(client.getFlagStatuses).mockResolvedValue({
        flagStatuses: [{ key: "flag-1", status: "active" }],
      });

      const result = await tools.getFlagStatuses({
        flagKeys: ["flag-1"],
        environmentKeys: ["production"],
      });
      const data = parseResult(result);

      expect(data.environmentKeys).toEqual(["production"]);
    });

    it("should use default environment when not provided", async () => {
      vi.mocked(client.getFlagStatuses).mockResolvedValue({});

      await tools.getFlagStatuses({ flagKeys: ["flag-1"] });

      expect(client.getFlagStatuses).toHaveBeenCalledWith(
        "default",
        ["flag-1"],
        ["production"]
      );
    });
  });

  describe("addFlagRule", () => {
    it("should add a rule with correct variation", async () => {
      vi.mocked(client.getFlag).mockResolvedValue({
        key: "my-flag",
        variations: [
          { _id: "var-true", value: true },
          { _id: "var-false", value: false },
        ],
      });
      vi.mocked(client.updateFlagTargeting).mockResolvedValue({
        key: "my-flag",
      });

      const result = await tools.addFlagRule({
        flagKey: "my-flag",
        variationIndex: 0,
        clauses: [
          {
            attribute: "email",
            op: "in",
            values: ["user@test.com"],
            contextKind: "user",
            negate: false,
          },
        ],
        description: "",
        comment: "",
      });
      const data = parseResult(result);

      expect(data.success).toBe(true);
      expect(data.ruleId).toBeDefined();

      const call = vi.mocked(client.updateFlagTargeting).mock.calls[0];
      const instructions = call[3];
      expect(instructions[0].kind).toBe("addRule");
      expect(instructions[0].variationId).toBe("var-true");
    });

    it("should error when variationIndex is out of bounds", async () => {
      vi.mocked(client.getFlag).mockResolvedValue({
        key: "my-flag",
        variations: [{ _id: "var-true", value: true }],
      });

      const result = await tools.addFlagRule({
        flagKey: "my-flag",
        variationIndex: 5,
        clauses: [
          {
            attribute: "key",
            op: "in",
            values: ["x"],
            contextKind: "user",
            negate: false,
          },
        ],
        description: "",
        comment: "",
      });
      const data = parseResult(result);

      expect(data.error).toContain("Invalid variationIndex");
    });

    it("should handle flags without variations", async () => {
      vi.mocked(client.getFlag).mockResolvedValue({
        key: "my-flag",
      });

      const result = await tools.addFlagRule({
        flagKey: "my-flag",
        variationIndex: 0,
        clauses: [
          {
            attribute: "key",
            op: "in",
            values: ["x"],
            contextKind: "user",
            negate: false,
          },
        ],
        description: "",
        comment: "",
      });
      const data = parseResult(result);

      expect(data.error).toContain("Invalid variationIndex");
    });
  });

  describe("updateFlagTargeting", () => {
    it("should send instructions to update targeting", async () => {
      vi.mocked(client.updateFlagTargeting).mockResolvedValue({
        key: "my-flag",
      });

      const result = await tools.updateFlagTargeting({
        flagKey: "my-flag",
        instructions: [{ kind: "turnFlagOn" }],
        comment: "",
      });
      const data = parseResult(result);

      expect(data.success).toBe(true);
      expect(data.message).toContain("targeting updated");
    });
  });

  describe("deleteFlag", () => {
    it("should delete and return success", async () => {
      vi.mocked(client.deleteFlag).mockResolvedValue(undefined);

      const result = await tools.deleteFlag({ flagKey: "old-flag" });
      const data = parseResult(result);

      expect(data.success).toBe(true);
      expect(data.message).toContain("deleted");
    });

    it("should handle delete error", async () => {
      vi.mocked(client.deleteFlag).mockRejectedValue(
        new LaunchDarklyMCPError("Not found", "API_ERROR", 404)
      );

      const result = await tools.deleteFlag({ flagKey: "missing" });
      const data = parseResult(result);

      expect(data.error).toContain("Not found");
    });
  });

  describe("listSegments", () => {
    it("should list segments with mapped fields", async () => {
      vi.mocked(client.listSegments).mockResolvedValue({
        items: [
          {
            key: "beta-users",
            name: "Beta Users",
            description: "Beta testers",
            tags: ["beta"],
            rules: [{ id: "1" }],
            included: ["user-1"],
            excluded: [],
            creationDate: 1234567890,
          },
        ],
        totalCount: 1,
      });

      const result = await tools.listSegments({
        limit: 20,
        offset: 0,
      });
      const data = parseResult(result);

      expect(data.totalCount).toBe(1);
      expect(data.segments[0].key).toBe("beta-users");
      expect(data.segments[0].rules).toBe(1);
      expect(data.segments[0].included).toBe(1);
    });
  });

  describe("getSegment", () => {
    it("should return segment detail", async () => {
      vi.mocked(client.getSegment).mockResolvedValue({
        key: "beta-users",
        rules: [],
      });

      const result = await tools.getSegment({ segmentKey: "beta-users" });
      const data = parseResult(result);

      expect(data.segment.key).toBe("beta-users");
      expect(data.project).toBe("default");
    });
  });

  describe("error formatting", () => {
    it("should format LaunchDarklyMCPError with code", async () => {
      vi.mocked(client.listFlags).mockRejectedValue(
        new LaunchDarklyMCPError("Rate limited", "RATE_LIMIT", 429)
      );

      const result = await tools.listFlags({ limit: 20, offset: 0 });
      const data = parseResult(result);

      expect(data.error).toContain("[RATE_LIMIT]");
      expect(data.error).toContain("Rate limited");
    });

    it("should format generic Error", async () => {
      vi.mocked(client.listFlags).mockRejectedValue(
        new Error("Network timeout")
      );

      const result = await tools.listFlags({ limit: 20, offset: 0 });
      const data = parseResult(result);

      expect(data.error).toContain("Unexpected error");
      expect(data.error).toContain("Network timeout");
    });

    it("should handle non-Error thrown values", async () => {
      vi.mocked(client.listFlags).mockRejectedValue("string error");

      const result = await tools.listFlags({ limit: 20, offset: 0 });
      const data = parseResult(result);

      expect(data.error).toContain("Unknown error");
    });
  });
});
