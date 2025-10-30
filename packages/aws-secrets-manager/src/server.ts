import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SecretsManagerClientWrapper } from "./secrets-manager.js";
import { AWSSecretsManagerMCPTools } from "./tools.js";
import {
  AWSConfig,
  AWSConfigSchema,
  CreateSecretParams,
  UpdateSecretParams,
  GetSecretParams,
  ListSecretsParams,
  DeleteSecretParams,
  DescribeSecretParams,
  CreateSecretParamsSchema,
  UpdateSecretParamsSchema,
  GetSecretParamsSchema,
  ListSecretsParamsSchema,
  DeleteSecretParamsSchema,
  DescribeSecretParamsSchema,
  AWSSecretsManagerMCPError,
} from "./types.js";

export class AWSSecretsManagerMCPServer {
  private server: McpServer;
  private client: SecretsManagerClientWrapper;
  private tools: AWSSecretsManagerMCPTools;

  constructor(config: AWSConfig) {
    this.server = new McpServer({
      name: "aws-secrets-manager-mcp-server",
      version: "1.0.0",
    });

    this.client = new SecretsManagerClientWrapper(config);
    this.tools = new AWSSecretsManagerMCPTools(this.client);

    this.setupTools();
  }

  static fromEnvironment(): AWSSecretsManagerMCPServer {
    const config = AWSConfigSchema.parse({
      region: process.env.AWS_REGION || "us-east-1",
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      profile: process.env.AWS_PROFILE,
      roleArn: process.env.AWS_ROLE_ARN,
      roleSessionName: process.env.AWS_ROLE_SESSION_NAME,
    });

    return new AWSSecretsManagerMCPServer(config);
  }

  private setupTools(): void {
    this.server.registerTool(
      "create_secret",
      {
        title: "Create Secret",
        description: "Create a new secret in AWS Secrets Manager",
        inputSchema: {
          name: CreateSecretParamsSchema.shape.name,
          secretValue: CreateSecretParamsSchema.shape.secretValue,
          description: CreateSecretParamsSchema.shape.description,
          tags: CreateSecretParamsSchema.shape.tags,
        },
      },
      async (params) => {
        return this.tools.createSecret(params as CreateSecretParams);
      }
    );

    this.server.registerTool(
      "update_secret",
      {
        title: "Update Secret",
        description: "Update an existing secret value",
        inputSchema: {
          secretId: UpdateSecretParamsSchema.shape.secretId,
          secretValue: UpdateSecretParamsSchema.shape.secretValue,
        },
      },
      async (params) => {
        return this.tools.updateSecret(params as UpdateSecretParams);
      }
    );

    this.server.registerTool(
      "get_secret",
      {
        title: "Get Secret",
        description: "Retrieve a secret value",
        inputSchema: {
          secretId: GetSecretParamsSchema.shape.secretId,
          versionStage: GetSecretParamsSchema.shape.versionStage,
        },
      },
      async (params) => {
        return this.tools.getSecret(params as GetSecretParams);
      }
    );

    this.server.registerTool(
      "list_secrets",
      {
        title: "List Secrets",
        description: "List all secrets",
        inputSchema: {
          maxResults: ListSecretsParamsSchema.shape.maxResults,
        },
      },
      async (params) => {
        return this.tools.listSecrets(params as ListSecretsParams);
      }
    );

    this.server.registerTool(
      "delete_secret",
      {
        title: "Delete Secret",
        description: "Delete a secret",
        inputSchema: {
          secretId: DeleteSecretParamsSchema.shape.secretId,
          forceDelete: DeleteSecretParamsSchema.shape.forceDelete,
          recoveryWindowInDays:
            DeleteSecretParamsSchema.shape.recoveryWindowInDays,
        },
      },
      async (params) => {
        return this.tools.deleteSecret(params as DeleteSecretParams);
      }
    );

    this.server.registerTool(
      "describe_secret",
      {
        title: "Describe Secret",
        description: "Get secret metadata",
        inputSchema: {
          secretId: DescribeSecretParamsSchema.shape.secretId,
        },
      },
      async (params) => {
        return this.tools.describeSecret(params as DescribeSecretParams);
      }
    );
  }

  async start(): Promise<void> {
    try {
      const isConnected = await this.client.testConnection();
      if (!isConnected) {
        throw new AWSSecretsManagerMCPError(
          "AWS Secrets Manager connection test failed. Please check your credentials and region.",
          "CONNECTION_TEST_FAILED"
        );
      }

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error("AWS Secrets Manager MCP Server started successfully");
    } catch (error) {
      console.error(
        "Failed to start AWS Secrets Manager MCP Server:",
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  }

  setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      console.error(`Received ${signal}, shutting down gracefully...`);
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("uncaughtException", async (error) => {
      console.error("Uncaught exception:", error);
      process.exit(1);
    });
    process.on("unhandledRejection", async (reason) => {
      console.error("Unhandled rejection:", reason);
      process.exit(1);
    });
  }
}
