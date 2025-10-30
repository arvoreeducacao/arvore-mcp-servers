import { z } from "zod";

export const AWSConfigSchema = z.object({
  region: z.string().default("us-east-1"),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  profile: z.string().optional(),
  roleArn: z.string().optional(),
  roleSessionName: z.string().optional(),
});

export type AWSConfig = z.infer<typeof AWSConfigSchema>;

export const CreateSecretParamsSchema = z.object({
  name: z.string().min(1, "Secret name is required"),
  secretValue: z.string().min(1, "Secret value is required"),
  description: z.string().optional(),
  tags: z.record(z.string()).optional(),
});

export type CreateSecretParams = z.infer<typeof CreateSecretParamsSchema>;

export const UpdateSecretParamsSchema = z.object({
  secretId: z.string().min(1, "Secret ID is required"),
  secretValue: z.string().min(1, "Secret value is required"),
});

export type UpdateSecretParams = z.infer<typeof UpdateSecretParamsSchema>;

export const GetSecretParamsSchema = z.object({
  secretId: z.string().min(1, "Secret ID is required"),
  versionStage: z.string().optional().default("AWSCURRENT"),
});

export type GetSecretParams = z.infer<typeof GetSecretParamsSchema>;

export const ListSecretsParamsSchema = z.object({
  maxResults: z.number().int().positive().max(100).optional(),
});

export type ListSecretsParams = z.infer<typeof ListSecretsParamsSchema>;

export const DeleteSecretParamsSchema = z.object({
  secretId: z.string().min(1, "Secret ID is required"),
  forceDelete: z.boolean().optional().default(false),
  recoveryWindowInDays: z.number().int().min(7).max(30).optional().default(30),
});

export type DeleteSecretParams = z.infer<typeof DeleteSecretParamsSchema>;

export const DescribeSecretParamsSchema = z.object({
  secretId: z.string().min(1, "Secret ID is required"),
});

export type DescribeSecretParams = z.infer<typeof DescribeSecretParamsSchema>;

export interface McpToolResult {
  [x: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class AWSSecretsManagerMCPError extends Error {
  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = "AWSSecretsManagerMCPError";
  }
}
