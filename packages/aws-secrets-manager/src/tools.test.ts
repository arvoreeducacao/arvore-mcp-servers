import { describe, it, expect, beforeEach, vi } from "vitest";
import { AWSSecretsManagerMCPTools } from "./tools.js";
import { SecretsManagerClientWrapper } from "./secrets-manager.js";
import { AWSSecretsManagerMCPError } from "./types.js";

vi.mock("./secrets-manager.js");

describe("AWSSecretsManagerMCPTools", () => {
  let tools: AWSSecretsManagerMCPTools;
  let mockClient: SecretsManagerClientWrapper;

  beforeEach(() => {
    mockClient = {
      createSecret: vi.fn(),
      updateSecret: vi.fn(),
      getSecret: vi.fn(),
      listSecrets: vi.fn(),
      deleteSecret: vi.fn(),
      describeSecret: vi.fn(),
    } as any;

    tools = new AWSSecretsManagerMCPTools(mockClient);
  });

  describe("createSecret", () => {
    it("should return success result when secret is created", async () => {
      vi.mocked(mockClient.createSecret).mockResolvedValue({
        arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test",
        name: "test-secret",
        versionId: "v1",
      });

      const result = await tools.createSecret({
        name: "test-secret",
        secretValue: "test-value",
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.success).toBe(true);
      expect(resultData.name).toBe("test-secret");
      expect(resultData.message).toContain("created successfully");
    });

    it("should handle AWS errors gracefully", async () => {
      vi.mocked(mockClient.createSecret).mockRejectedValue(
        new AWSSecretsManagerMCPError(
          "Secret already exists",
          "RESOURCE_EXISTS"
        )
      );

      const result = await tools.createSecret({
        name: "existing-secret",
        secretValue: "test-value",
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.error).toContain("AWS Secrets Manager Error");
      expect(resultData.secretName).toBe("existing-secret");
    });

    it("should handle unexpected errors", async () => {
      vi.mocked(mockClient.createSecret).mockRejectedValue(
        new Error("Network error")
      );

      const result = await tools.createSecret({
        name: "test-secret",
        secretValue: "test-value",
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.error).toContain("Unexpected error");
    });
  });

  describe("updateSecret", () => {
    it("should return success result when secret is updated", async () => {
      vi.mocked(mockClient.updateSecret).mockResolvedValue({
        arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test",
        name: "test-secret",
        versionId: "v2",
      });

      const result = await tools.updateSecret({
        secretId: "test-secret",
        secretValue: "new-value",
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.success).toBe(true);
      expect(resultData.message).toContain("updated successfully");
      expect(resultData.versionId).toBe("v2");
    });

    it("should handle not found error", async () => {
      vi.mocked(mockClient.updateSecret).mockRejectedValue(
        new AWSSecretsManagerMCPError("Secret not found", "RESOURCE_NOT_FOUND")
      );

      const result = await tools.updateSecret({
        secretId: "non-existent",
        secretValue: "new-value",
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.error).toContain("AWS Secrets Manager Error");
    });
  });

  describe("getSecret", () => {
    it("should return secret value with metadata", async () => {
      const createdDate = new Date("2024-01-01");
      vi.mocked(mockClient.getSecret).mockResolvedValue({
        arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test",
        name: "test-secret",
        secretValue: "secret-value",
        versionId: "v1",
        createdDate,
      });

      const result = await tools.getSecret({
        secretId: "test-secret",
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.secretValue).toBe("secret-value");
      expect(resultData.name).toBe("test-secret");
      expect(resultData.createdDate).toBe(createdDate.toISOString());
    });

    it("should handle secret not found", async () => {
      vi.mocked(mockClient.getSecret).mockRejectedValue(
        new AWSSecretsManagerMCPError("Secret not found", "RESOURCE_NOT_FOUND")
      );

      const result = await tools.getSecret({
        secretId: "non-existent",
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.error).toBeDefined();
      expect(resultData.secretId).toBe("non-existent");
    });
  });

  describe("listSecrets", () => {
    it("should return formatted list of secrets", async () => {
      vi.mocked(mockClient.listSecrets).mockResolvedValue([
        {
          arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:secret1",
          name: "secret1",
          description: "First secret",
          lastChangedDate: new Date("2024-01-01"),
          tags: [
            { Key: "env", Value: "prod" },
            { Key: "team", Value: "engineering" },
          ],
        },
        {
          arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:secret2",
          name: "secret2",
        },
      ]);

      const result = await tools.listSecrets({});

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.count).toBe(2);
      expect(resultData.secrets).toHaveLength(2);
      expect(resultData.secrets[0].tags).toEqual({
        env: "prod",
        team: "engineering",
      });
    });

    it("should return empty list when no secrets exist", async () => {
      vi.mocked(mockClient.listSecrets).mockResolvedValue([]);

      const result = await tools.listSecrets({});

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.count).toBe(0);
      expect(resultData.secrets).toHaveLength(0);
    });

    it("should handle list errors", async () => {
      vi.mocked(mockClient.listSecrets).mockRejectedValue(
        new AWSSecretsManagerMCPError("Permission denied", "LIST_FAILED")
      );

      const result = await tools.listSecrets({});

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.error).toContain("AWS Secrets Manager Error");
    });
  });

  describe("deleteSecret", () => {
    it("should schedule secret deletion with recovery window", async () => {
      const deletionDate = new Date("2024-02-01");
      vi.mocked(mockClient.deleteSecret).mockResolvedValue({
        arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test",
        name: "test-secret",
        deletionDate,
      });

      const result = await tools.deleteSecret({
        secretId: "test-secret",
        forceDelete: false,
        recoveryWindowInDays: 30,
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.success).toBe(true);
      expect(resultData.message).toContain("scheduled for deletion in 30 days");
      expect(resultData.deletionDate).toBe(deletionDate.toISOString());
    });

    it("should force delete secret immediately", async () => {
      vi.mocked(mockClient.deleteSecret).mockResolvedValue({
        arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test",
        name: "test-secret",
        deletionDate: new Date(),
      });

      const result = await tools.deleteSecret({
        secretId: "test-secret",
        forceDelete: true,
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.success).toBe(true);
      expect(resultData.message).toContain("deleted immediately");
    });

    it("should handle deletion errors", async () => {
      vi.mocked(mockClient.deleteSecret).mockRejectedValue(
        new AWSSecretsManagerMCPError("Secret not found", "RESOURCE_NOT_FOUND")
      );

      const result = await tools.deleteSecret({
        secretId: "non-existent",
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.error).toBeDefined();
    });
  });

  describe("describeSecret", () => {
    it("should return complete secret metadata", async () => {
      vi.mocked(mockClient.describeSecret).mockResolvedValue({
        arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test",
        name: "test-secret",
        description: "Test description",
        rotationEnabled: true,
        rotationLambdaARN:
          "arn:aws:lambda:us-east-1:123456789012:function:rotate",
        lastRotatedDate: new Date("2024-01-15"),
        lastChangedDate: new Date("2024-01-20"),
        tags: [{ Key: "env", Value: "prod" }],
        versionIdsToStages: {
          v1: ["AWSCURRENT"],
        },
      });

      const result = await tools.describeSecret({
        secretId: "test-secret",
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.name).toBe("test-secret");
      expect(resultData.rotationEnabled).toBe(true);
      expect(resultData.versionIdsToStages).toBeDefined();
      expect(resultData.tags).toEqual({ env: "prod" });
    });

    it("should handle describe errors", async () => {
      vi.mocked(mockClient.describeSecret).mockRejectedValue(
        new AWSSecretsManagerMCPError("Secret not found", "RESOURCE_NOT_FOUND")
      );

      const result = await tools.describeSecret({
        secretId: "non-existent",
      });

      const resultData = JSON.parse(result.content[0].text);
      expect(resultData.error).toBeDefined();
    });
  });
});
