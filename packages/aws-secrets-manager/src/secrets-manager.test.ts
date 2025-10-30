import { describe, it, expect, beforeEach, vi } from "vitest";
import { SecretsManagerClientWrapper } from "./secrets-manager.js";
import {
  SecretsManagerClient,
  CreateSecretCommand,
  UpdateSecretCommand,
  GetSecretValueCommand,
  ListSecretsCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  ResourceNotFoundException,
  InvalidRequestException,
  ResourceExistsException,
} from "@aws-sdk/client-secrets-manager";
import { AWSSecretsManagerMCPError } from "./types.js";

vi.mock("@aws-sdk/client-secrets-manager");
vi.mock("@aws-sdk/credential-providers");

describe("SecretsManagerClientWrapper", () => {
  let client: SecretsManagerClientWrapper;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSend = vi.fn();
    vi.mocked(SecretsManagerClient).mockImplementation(
      () =>
        ({
          send: mockSend,
        } as any)
    );

    client = new SecretsManagerClientWrapper({
      region: "us-east-1",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    });
  });

  describe("createSecret", () => {
    it("should create a secret successfully", async () => {
      mockSend.mockResolvedValue({
        ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret",
        Name: "test-secret",
        VersionId: "v1",
      });

      const result = await client.createSecret({
        name: "test-secret",
        secretValue: "test-value",
      });

      expect(result).toEqual({
        arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret",
        name: "test-secret",
        versionId: "v1",
      });
      expect(mockSend).toHaveBeenCalledWith(expect.any(CreateSecretCommand));
    });

    it("should create a secret with description and tags", async () => {
      mockSend.mockResolvedValue({
        ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret",
        Name: "test-secret",
        VersionId: "v1",
      });

      const result = await client.createSecret({
        name: "test-secret",
        secretValue: "test-value",
        description: "Test description",
        tags: { env: "test", team: "engineering" },
      });

      expect(result.arn).toBeDefined();
      expect(mockSend).toHaveBeenCalledWith(expect.any(CreateSecretCommand));
    });

    it("should throw error when secret already exists", async () => {
      mockSend.mockRejectedValue(
        new ResourceExistsException({
          message: "Secret already exists",
          $metadata: {},
        })
      );

      await expect(
        client.createSecret({
          name: "existing-secret",
          secretValue: "test-value",
        })
      ).rejects.toThrow(AWSSecretsManagerMCPError);
    });

    it("should throw error for invalid request", async () => {
      mockSend.mockRejectedValue(
        new InvalidRequestException({
          message: "Invalid secret name",
          $metadata: {},
        })
      );

      await expect(
        client.createSecret({
          name: "invalid name with spaces",
          secretValue: "test-value",
        })
      ).rejects.toThrow(AWSSecretsManagerMCPError);
    });
  });

  describe("updateSecret", () => {
    it("should update a secret successfully", async () => {
      mockSend.mockResolvedValue({
        ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret",
        Name: "test-secret",
        VersionId: "v2",
      });

      const result = await client.updateSecret({
        secretId: "test-secret",
        secretValue: "new-value",
      });

      expect(result).toEqual({
        arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret",
        name: "test-secret",
        versionId: "v2",
      });
      expect(mockSend).toHaveBeenCalledWith(expect.any(UpdateSecretCommand));
    });

    it("should throw error when secret not found", async () => {
      mockSend.mockRejectedValue(
        new ResourceNotFoundException({
          message: "Secret not found",
          $metadata: {},
        })
      );

      await expect(
        client.updateSecret({
          secretId: "non-existent-secret",
          secretValue: "new-value",
        })
      ).rejects.toThrow(AWSSecretsManagerMCPError);
    });
  });

  describe("getSecret", () => {
    it("should get secret value successfully", async () => {
      const createdDate = new Date("2024-01-01");
      mockSend.mockResolvedValue({
        ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret",
        Name: "test-secret",
        SecretString: "secret-value",
        VersionId: "v1",
        CreatedDate: createdDate,
      });

      const result = await client.getSecret({
        secretId: "test-secret",
      });

      expect(result).toEqual({
        arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret",
        name: "test-secret",
        secretValue: "secret-value",
        versionId: "v1",
        createdDate,
      });
      expect(mockSend).toHaveBeenCalledWith(expect.any(GetSecretValueCommand));
    });

    it("should get secret with specific version stage", async () => {
      mockSend.mockResolvedValue({
        ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret",
        Name: "test-secret",
        SecretString: "secret-value",
        VersionId: "v1",
      });

      await client.getSecret({
        secretId: "test-secret",
        versionStage: "AWSPREVIOUS",
      });

      expect(mockSend).toHaveBeenCalledWith(expect.any(GetSecretValueCommand));
    });

    it("should throw error when secret not found", async () => {
      mockSend.mockRejectedValue(
        new ResourceNotFoundException({
          message: "Secret not found",
          $metadata: {},
        })
      );

      await expect(
        client.getSecret({
          secretId: "non-existent-secret",
        })
      ).rejects.toThrow(AWSSecretsManagerMCPError);
    });
  });

  describe("listSecrets", () => {
    it("should list secrets successfully", async () => {
      mockSend.mockResolvedValue({
        SecretList: [
          {
            ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:secret1",
            Name: "secret1",
            Description: "First secret",
            LastChangedDate: new Date("2024-01-01"),
            Tags: [
              { Key: "env", Value: "prod" },
              { Key: "team", Value: "engineering" },
            ],
          },
          {
            ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:secret2",
            Name: "secret2",
          },
        ],
      });

      const result = await client.listSecrets({});

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("secret1");
      expect(result[0].description).toBe("First secret");
      expect(result[0].tags).toEqual([
        { Key: "env", Value: "prod" },
        { Key: "team", Value: "engineering" },
      ]);
      expect(mockSend).toHaveBeenCalledWith(expect.any(ListSecretsCommand));
    });

    it("should list secrets with max results", async () => {
      mockSend.mockResolvedValue({
        SecretList: [],
      });

      await client.listSecrets({ maxResults: 10 });

      expect(mockSend).toHaveBeenCalledWith(expect.any(ListSecretsCommand));
    });

    it("should return empty array when no secrets exist", async () => {
      mockSend.mockResolvedValue({
        SecretList: undefined,
      });

      const result = await client.listSecrets({});

      expect(result).toEqual([]);
    });

    it("should filter out tags without Key or Value", async () => {
      mockSend.mockResolvedValue({
        SecretList: [
          {
            ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:secret1",
            Name: "secret1",
            Tags: [
              { Key: "env", Value: "prod" },
              { Key: "invalid" },
              { Value: "orphan" },
            ],
          },
        ],
      });

      const result = await client.listSecrets({});

      expect(result[0].tags).toEqual([{ Key: "env", Value: "prod" }]);
    });
  });

  describe("deleteSecret", () => {
    it("should schedule secret deletion with recovery window", async () => {
      const deletionDate = new Date("2024-02-01");
      mockSend.mockResolvedValue({
        ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret",
        Name: "test-secret",
        DeletionDate: deletionDate,
      });

      const result = await client.deleteSecret({
        secretId: "test-secret",
        forceDelete: false,
        recoveryWindowInDays: 30,
      });

      expect(result).toEqual({
        arn: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret",
        name: "test-secret",
        deletionDate,
      });
      expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteSecretCommand));
    });

    it("should force delete secret immediately", async () => {
      mockSend.mockResolvedValue({
        ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret",
        Name: "test-secret",
        DeletionDate: new Date(),
      });

      await client.deleteSecret({
        secretId: "test-secret",
        forceDelete: true,
      });

      expect(mockSend).toHaveBeenCalledWith(expect.any(DeleteSecretCommand));
    });

    it("should throw error when secret not found", async () => {
      mockSend.mockRejectedValue(
        new ResourceNotFoundException({
          message: "Secret not found",
          $metadata: {},
        })
      );

      await expect(
        client.deleteSecret({
          secretId: "non-existent-secret",
        })
      ).rejects.toThrow(AWSSecretsManagerMCPError);
    });
  });

  describe("describeSecret", () => {
    it("should describe secret with all metadata", async () => {
      mockSend.mockResolvedValue({
        ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret",
        Name: "test-secret",
        Description: "Test description",
        RotationEnabled: true,
        RotationLambdaARN:
          "arn:aws:lambda:us-east-1:123456789012:function:rotate",
        LastRotatedDate: new Date("2024-01-15"),
        LastChangedDate: new Date("2024-01-20"),
        LastAccessedDate: new Date("2024-01-25"),
        Tags: [{ Key: "env", Value: "prod" }],
        VersionIdsToStages: {
          v1: ["AWSCURRENT"],
          v2: ["AWSPREVIOUS"],
        },
      });

      const result = await client.describeSecret({
        secretId: "test-secret",
      });

      expect(result.rotationEnabled).toBe(true);
      expect(result.rotationLambdaARN).toBe(
        "arn:aws:lambda:us-east-1:123456789012:function:rotate"
      );
      expect(result.versionIdsToStages).toBeDefined();
      expect(mockSend).toHaveBeenCalledWith(expect.any(DescribeSecretCommand));
    });

    it("should describe secret without optional fields", async () => {
      mockSend.mockResolvedValue({
        ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret",
        Name: "test-secret",
      });

      const result = await client.describeSecret({
        secretId: "test-secret",
      });

      expect(result.arn).toBeDefined();
      expect(result.name).toBe("test-secret");
      expect(result.description).toBeUndefined();
    });

    it("should throw error when secret not found", async () => {
      mockSend.mockRejectedValue(
        new ResourceNotFoundException({
          message: "Secret not found",
          $metadata: {},
        })
      );

      await expect(
        client.describeSecret({
          secretId: "non-existent-secret",
        })
      ).rejects.toThrow(AWSSecretsManagerMCPError);
    });
  });

  describe("testConnection", () => {
    it("should return true when connection is successful", async () => {
      mockSend.mockResolvedValue({
        SecretList: [],
      });

      const result = await client.testConnection();

      expect(result).toBe(true);
    });

    it("should return false when connection fails", async () => {
      mockSend.mockRejectedValue(new Error("Connection failed"));

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });
});
