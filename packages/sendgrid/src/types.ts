import { z } from "zod";

export const ListTemplatesParamsSchema = z.object({
  generations: z
    .enum(["legacy", "dynamic"])
    .optional()
    .default("dynamic")
    .describe("Filter by template generation type"),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .default(20)
    .describe("Number of templates per page"),
  pageToken: z
    .string()
    .optional()
    .describe("Token for pagination (from previous response)"),
});

export const GetTemplateParamsSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
});

export const CreateTemplateParamsSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  generation: z
    .enum(["legacy", "dynamic"])
    .optional()
    .default("dynamic"),
});

export const UpdateTemplateParamsSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  name: z.string().min(1, "Template name is required"),
});

export const DeleteTemplateParamsSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
});

export const CreateVersionParamsSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  name: z.string().min(1, "Version name is required"),
  subject: z.string().min(1, "Subject is required"),
  htmlContent: z.string().optional().describe("HTML content of the template"),
  plainContent: z.string().optional().describe("Plain text content"),
  active: z
    .number()
    .int()
    .min(0)
    .max(1)
    .optional()
    .default(1)
    .describe("1 = active, 0 = draft"),
});

export const GetVersionParamsSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  versionId: z.string().min(1, "Version ID is required"),
});

export const UpdateVersionParamsSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  versionId: z.string().min(1, "Version ID is required"),
  name: z.string().optional(),
  subject: z.string().optional(),
  htmlContent: z.string().optional(),
  plainContent: z.string().optional(),
  active: z.number().int().min(0).max(1).optional(),
});

export const DeleteVersionParamsSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  versionId: z.string().min(1, "Version ID is required"),
});

export const ActivateVersionParamsSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  versionId: z.string().min(1, "Version ID is required"),
});

export type ListTemplatesParams = z.infer<typeof ListTemplatesParamsSchema>;
export type GetTemplateParams = z.infer<typeof GetTemplateParamsSchema>;
export type CreateTemplateParams = z.infer<typeof CreateTemplateParamsSchema>;
export type UpdateTemplateParams = z.infer<typeof UpdateTemplateParamsSchema>;
export type DeleteTemplateParams = z.infer<typeof DeleteTemplateParamsSchema>;
export type CreateVersionParams = z.infer<typeof CreateVersionParamsSchema>;
export type GetVersionParams = z.infer<typeof GetVersionParamsSchema>;
export type UpdateVersionParams = z.infer<typeof UpdateVersionParamsSchema>;
export type DeleteVersionParams = z.infer<typeof DeleteVersionParamsSchema>;
export type ActivateVersionParams = z.infer<typeof ActivateVersionParamsSchema>;

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class SendGridMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "SendGridMCPError";
  }
}
