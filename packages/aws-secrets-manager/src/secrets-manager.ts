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
import { fromIni } from "@aws-sdk/credential-providers";
import {
  AWSConfig,
  AWSSecretsManagerMCPError,
  CreateSecretParams,
  UpdateSecretParams,
  GetSecretParams,
  ListSecretsParams,
  DeleteSecretParams,
  DescribeSecretParams,
} from "./types.js";

export class SecretsManagerClientWrapper {
  private client: SecretsManagerClient;

  constructor(config: AWSConfig) {
    let credentials;

    if (config.profile) {
      credentials = fromIni({
        profile: config.profile,
      });
    } else if (config.accessKeyId && config.secretAccessKey) {
      credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }

    this.client = new SecretsManagerClient({
      region: config.region,
      credentials,
    });
  }

  async createSecret(params: CreateSecretParams): Promise<{
    arn: string;
    name: string;
    versionId?: string;
  }> {
    try {
      const tags = params.tags
        ? Object.entries(params.tags).map(([Key, Value]) => ({ Key, Value }))
        : undefined;

      const command = new CreateSecretCommand({
        Name: params.name,
        SecretString: params.secretValue,
        Description: params.description,
        Tags: tags,
      });

      const response = await this.client.send(command);

      return {
        arn: response.ARN!,
        name: response.Name!,
        versionId: response.VersionId,
      };
    } catch (error: unknown) {
      if (error instanceof ResourceExistsException) {
        throw new AWSSecretsManagerMCPError(
          `Secret with name "${params.name}" already exists`,
          "RESOURCE_EXISTS",
          error
        );
      }
      if (error instanceof InvalidRequestException) {
        throw new AWSSecretsManagerMCPError(
          `Invalid request: ${error.message}`,
          "INVALID_REQUEST",
          error
        );
      }
      throw new AWSSecretsManagerMCPError(
        `Failed to create secret: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "CREATE_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async updateSecret(params: UpdateSecretParams): Promise<{
    arn: string;
    name: string;
    versionId?: string;
  }> {
    try {
      const command = new UpdateSecretCommand({
        SecretId: params.secretId,
        SecretString: params.secretValue,
      });

      const response = await this.client.send(command);

      return {
        arn: response.ARN!,
        name: response.Name!,
        versionId: response.VersionId,
      };
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundException) {
        throw new AWSSecretsManagerMCPError(
          `Secret "${params.secretId}" not found`,
          "RESOURCE_NOT_FOUND",
          error
        );
      }
      if (error instanceof InvalidRequestException) {
        throw new AWSSecretsManagerMCPError(
          `Invalid request: ${error.message}`,
          "INVALID_REQUEST",
          error
        );
      }
      throw new AWSSecretsManagerMCPError(
        `Failed to update secret: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "UPDATE_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async getSecret(params: GetSecretParams): Promise<{
    arn: string;
    name: string;
    secretValue: string;
    versionId?: string;
    createdDate?: Date;
  }> {
    try {
      const command = new GetSecretValueCommand({
        SecretId: params.secretId,
        VersionStage: params.versionStage,
      });

      const response = await this.client.send(command);

      return {
        arn: response.ARN!,
        name: response.Name!,
        secretValue: response.SecretString!,
        versionId: response.VersionId,
        createdDate: response.CreatedDate,
      };
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundException) {
        throw new AWSSecretsManagerMCPError(
          `Secret "${params.secretId}" not found`,
          "RESOURCE_NOT_FOUND",
          error
        );
      }
      throw new AWSSecretsManagerMCPError(
        `Failed to get secret: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "GET_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async listSecrets(params: ListSecretsParams): Promise<
    Array<{
      arn: string;
      name: string;
      description?: string;
      lastChangedDate?: Date;
      lastAccessedDate?: Date;
      tags?: Array<{ Key: string; Value: string }>;
    }>
  > {
    try {
      const command = new ListSecretsCommand({
        MaxResults: params.maxResults,
      });

      const response = await this.client.send(command);

      return (
        response.SecretList?.map((secret) => ({
          arn: secret.ARN!,
          name: secret.Name!,
          description: secret.Description,
          lastChangedDate: secret.LastChangedDate,
          lastAccessedDate: secret.LastAccessedDate,
          tags: secret.Tags?.filter((tag) => tag.Key && tag.Value).map(
            (tag) => ({
              Key: tag.Key!,
              Value: tag.Value!,
            })
          ),
        })) || []
      );
    } catch (error: unknown) {
      throw new AWSSecretsManagerMCPError(
        `Failed to list secrets: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "LIST_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteSecret(params: DeleteSecretParams): Promise<{
    arn: string;
    name: string;
    deletionDate?: Date;
  }> {
    try {
      const command = new DeleteSecretCommand({
        SecretId: params.secretId,
        ForceDeleteWithoutRecovery: params.forceDelete,
        RecoveryWindowInDays: params.forceDelete
          ? undefined
          : params.recoveryWindowInDays,
      });

      const response = await this.client.send(command);

      return {
        arn: response.ARN!,
        name: response.Name!,
        deletionDate: response.DeletionDate,
      };
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundException) {
        throw new AWSSecretsManagerMCPError(
          `Secret "${params.secretId}" not found`,
          "RESOURCE_NOT_FOUND",
          error
        );
      }
      if (error instanceof InvalidRequestException) {
        throw new AWSSecretsManagerMCPError(
          `Invalid request: ${error.message}`,
          "INVALID_REQUEST",
          error
        );
      }
      throw new AWSSecretsManagerMCPError(
        `Failed to delete secret: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "DELETE_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async describeSecret(params: DescribeSecretParams): Promise<{
    arn: string;
    name: string;
    description?: string;
    rotationEnabled?: boolean;
    rotationLambdaARN?: string;
    lastRotatedDate?: Date;
    lastChangedDate?: Date;
    lastAccessedDate?: Date;
    deletedDate?: Date;
    tags?: Array<{ Key: string; Value: string }>;
    versionIdsToStages?: Record<string, string[]>;
  }> {
    try {
      const command = new DescribeSecretCommand({
        SecretId: params.secretId,
      });

      const response = await this.client.send(command);

      return {
        arn: response.ARN!,
        name: response.Name!,
        description: response.Description,
        rotationEnabled: response.RotationEnabled,
        rotationLambdaARN: response.RotationLambdaARN,
        lastRotatedDate: response.LastRotatedDate,
        lastChangedDate: response.LastChangedDate,
        lastAccessedDate: response.LastAccessedDate,
        deletedDate: response.DeletedDate,
        tags: response.Tags?.filter((tag) => tag.Key && tag.Value).map(
          (tag) => ({
            Key: tag.Key!,
            Value: tag.Value!,
          })
        ),
        versionIdsToStages: response.VersionIdsToStages,
      };
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundException) {
        throw new AWSSecretsManagerMCPError(
          `Secret "${params.secretId}" not found`,
          "RESOURCE_NOT_FOUND",
          error
        );
      }
      throw new AWSSecretsManagerMCPError(
        `Failed to describe secret: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "DESCRIBE_FAILED",
        error instanceof Error ? error : undefined
      );
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.send(new ListSecretsCommand({ MaxResults: 1 }));
      return true;
    } catch (error: unknown) {
      console.error(
        "Connection test error:",
        error instanceof Error ? error.message : String(error)
      );
      if (error instanceof Error && "Code" in error) {
        console.error("Error code:", (error as Error & { Code: string }).Code);
      }
      return false;
    }
  }
}
