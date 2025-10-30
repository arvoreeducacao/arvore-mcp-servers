import { SecretsManagerClientWrapper } from "./secrets-manager.js";
import {
  CreateSecretParams,
  UpdateSecretParams,
  GetSecretParams,
  ListSecretsParams,
  DeleteSecretParams,
  DescribeSecretParams,
  McpToolResult,
  AWSSecretsManagerMCPError,
} from "./types.js";

export class AWSSecretsManagerMCPTools {
  constructor(private client: SecretsManagerClientWrapper) {}

  async createSecret(params: CreateSecretParams): Promise<McpToolResult> {
    try {
      const result = await this.client.createSecret(params);

      const resultData = {
        success: true,
        arn: result.arn,
        name: result.name,
        versionId: result.versionId,
        message: `Secret "${params.name}" created successfully`,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof AWSSecretsManagerMCPError
          ? `AWS Secrets Manager Error: ${error.message}`
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
                secretName: params.name,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async updateSecret(params: UpdateSecretParams): Promise<McpToolResult> {
    try {
      const result = await this.client.updateSecret(params);

      const resultData = {
        success: true,
        arn: result.arn,
        name: result.name,
        versionId: result.versionId,
        message: `Secret "${params.secretId}" updated successfully`,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof AWSSecretsManagerMCPError
          ? `AWS Secrets Manager Error: ${error.message}`
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
                secretId: params.secretId,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async getSecret(params: GetSecretParams): Promise<McpToolResult> {
    try {
      const result = await this.client.getSecret(params);

      const resultData = {
        arn: result.arn,
        name: result.name,
        secretValue: result.secretValue,
        versionId: result.versionId,
        createdDate: result.createdDate?.toISOString(),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof AWSSecretsManagerMCPError
          ? `AWS Secrets Manager Error: ${error.message}`
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
                secretId: params.secretId,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async listSecrets(params: ListSecretsParams): Promise<McpToolResult> {
    try {
      const secrets = await this.client.listSecrets(params);

      const resultData = {
        count: secrets.length,
        secrets: secrets.map((secret) => ({
          arn: secret.arn,
          name: secret.name,
          description: secret.description,
          lastChangedDate: secret.lastChangedDate?.toISOString(),
          lastAccessedDate: secret.lastAccessedDate?.toISOString(),
          tags: secret.tags?.reduce(
            (acc, tag) => ({ ...acc, [tag.Key]: tag.Value }),
            {}
          ),
        })),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof AWSSecretsManagerMCPError
          ? `AWS Secrets Manager Error: ${error.message}`
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
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async deleteSecret(params: DeleteSecretParams): Promise<McpToolResult> {
    try {
      const result = await this.client.deleteSecret(params);

      const resultData = {
        success: true,
        arn: result.arn,
        name: result.name,
        deletionDate: result.deletionDate?.toISOString(),
        message: params.forceDelete
          ? `Secret "${params.secretId}" deleted immediately`
          : `Secret "${params.secretId}" scheduled for deletion in ${params.recoveryWindowInDays} days`,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof AWSSecretsManagerMCPError
          ? `AWS Secrets Manager Error: ${error.message}`
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
                secretId: params.secretId,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async describeSecret(params: DescribeSecretParams): Promise<McpToolResult> {
    try {
      const result = await this.client.describeSecret(params);

      const resultData = {
        arn: result.arn,
        name: result.name,
        description: result.description,
        rotationEnabled: result.rotationEnabled,
        rotationLambdaARN: result.rotationLambdaARN,
        lastRotatedDate: result.lastRotatedDate?.toISOString(),
        lastChangedDate: result.lastChangedDate?.toISOString(),
        lastAccessedDate: result.lastAccessedDate?.toISOString(),
        deletedDate: result.deletedDate?.toISOString(),
        tags: result.tags?.reduce(
          (acc, tag) => ({ ...acc, [tag.Key]: tag.Value }),
          {}
        ),
        versionIdsToStages: result.versionIdsToStages,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(resultData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof AWSSecretsManagerMCPError
          ? `AWS Secrets Manager Error: ${error.message}`
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
                secretId: params.secretId,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
}


