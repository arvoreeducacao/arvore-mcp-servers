import { z } from "zod";
import { MESSAGE_KINDS } from "./types.js";

export const SpawnTeamTeammateSchema = z.object({
  agent: z.string().min(1, "Agent file path is required (e.g. refinement.md)"),
  mcp_servers: z.array(z.string()).optional(),
});

export const SpawnTeamSchema = z.object({
  objective: z.string().min(1, "Team objective is required"),
  teammates: z
    .array(SpawnTeamTeammateSchema)
    .min(1, "At least one teammate is required"),
});

export const AddTeammateSchema = z.object({
  agent: z.string().min(1, "Agent file path is required"),
  mcp_servers: z.array(z.string()).optional(),
});

export const RemoveTeammateSchema = z.object({
  teammate_id: z.string().min(1, "Teammate ID is required"),
});

export const CreateTaskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  description: z.string().min(1, "Task description is required"),
  depends_on: z.array(z.string()).optional().default([]),
  exclusive_paths: z.array(z.string()).optional().default([]),
  acceptance_criteria: z.array(z.string()).optional().default([]),
});

export const TeamStatusSchema = z.object({});

export const SendMessageSchema = z.object({
  to: z.string().optional(),
  broadcast: z.boolean().optional().default(false),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
  kind: z.enum(MESSAGE_KINDS).optional().default("info"),
});

export const WaitForTeamSchema = z.object({
  timeout_seconds: z.number().positive().optional().default(300),
});

export const ReadArtifactSchema = z.object({
  artifact_id: z.string().min(1, "Artifact ID is required"),
});

export type SpawnTeamParams = z.infer<typeof SpawnTeamSchema>;
export type AddTeammateParams = z.infer<typeof AddTeammateSchema>;
export type RemoveTeammateParams = z.infer<typeof RemoveTeammateSchema>;
export type CreateTaskParams = z.infer<typeof CreateTaskSchema>;
export type SendMessageParams = z.infer<typeof SendMessageSchema>;
export type WaitForTeamParams = z.infer<typeof WaitForTeamSchema>;
export type ReadArtifactParams = z.infer<typeof ReadArtifactSchema>;

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class AgentTeamsError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "AgentTeamsError";
  }
}
