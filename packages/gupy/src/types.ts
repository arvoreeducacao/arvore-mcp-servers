import { z } from "zod";

const HttpMethod = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export const RawRequestParamsSchema = z.object({
  method: HttpMethod.describe("HTTP method"),
  path: z
    .string()
    .min(1)
    .describe(
      "Path starting with '/api/' (e.g. '/api/v1/jobs', '/api/v2/jobs'). The base host is api.gupy.io."
    ),
  query: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe("Query string parameters"),
  body: z
    .record(z.unknown())
    .optional()
    .describe("JSON body for POST/PUT/PATCH/DELETE"),
});

const Pagination = {
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Page size (max 100)"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Result offset for pagination"),
};

export const ListJobsParamsSchema = z.object({
  ...Pagination,
  status: z
    .string()
    .optional()
    .describe(
      "Filter by job status (e.g. published, draft, closed, suspended)"
    ),
  code: z.string().optional().describe("Filter by job code"),
  name: z.string().optional().describe("Filter by job name (partial match)"),
});

export const GetJobParamsSchema = z.object({
  jobId: z.union([z.string(), z.number()]).describe("Job ID"),
});

export const UpdateJobStatusParamsSchema = z.object({
  jobId: z.union([z.string(), z.number()]).describe("Job ID"),
  status: z
    .string()
    .describe(
      "New status. See https://developers.gupy.io/docs/mudanças-de-estado-de-uma-vaga"
    ),
});

export const ListApplicationsParamsSchema = z.object({
  jobId: z.union([z.string(), z.number()]).describe("Job ID"),
  ...Pagination,
  currentStep: z
    .string()
    .optional()
    .describe("Filter applications by current step name"),
  status: z
    .string()
    .optional()
    .describe("Filter by application status"),
  fields: z
    .enum(["name", "id", "code", "all"])
    .optional()
    .describe(
      "Controls which application fields are returned. Use 'all' to include candidate details such as workExperience, academicQualification and languages. Defaults to Gupy's standard response when omitted."
    ),
});

export const ListApplicationExperiencesParamsSchema = z.object({
  jobId: z.union([z.string(), z.number()]).describe("Job ID"),
  ...Pagination,
  currentStep: z
    .string()
    .optional()
    .describe("Filter applications by current step name"),
  status: z
    .string()
    .optional()
    .describe("Filter by application status"),
});

export const MoveApplicationParamsSchema = z.object({
  jobId: z.union([z.string(), z.number()]).describe("Job ID"),
  applicationId: z
    .union([z.string(), z.number()])
    .describe("Application ID"),
  step: z.string().describe("Target step name (e.g. 'inscricao', 'triagem')"),
  status: z
    .string()
    .optional()
    .describe(
      "Optional status within the step (e.g. 'approved', 'reproved', 'pending')"
    ),
});

export const CreateApplicationCommentParamsSchema = z.object({
  jobId: z.union([z.string(), z.number()]).describe("Job ID"),
  applicationId: z
    .union([z.string(), z.number()])
    .describe("Application ID"),
  comment: z.string().min(1).describe("Comment text"),
});

export const ListApplicationCommentsParamsSchema = z.object({
  jobId: z.union([z.string(), z.number()]).describe("Job ID"),
  applicationId: z
    .union([z.string(), z.number()])
    .describe("Application ID"),
  ...Pagination,
});

export const TagApplicationParamsSchema = z.object({
  jobId: z.union([z.string(), z.number()]).describe("Job ID"),
  applicationId: z
    .union([z.string(), z.number()])
    .describe("Application ID"),
  tags: z.array(z.string()).min(1).describe("Tag values to add"),
});

export const SendCandidateMessageParamsSchema = z.object({
  jobId: z.union([z.string(), z.number()]).describe("Job ID"),
  applicationId: z
    .union([z.string(), z.number()])
    .describe("Application ID"),
  subject: z.string().min(1).describe("Email subject"),
  body: z.string().min(1).describe("Email body (HTML allowed)"),
});

export const ListCandidatesParamsSchema = z.object({
  ...Pagination,
  email: z.string().optional().describe("Filter by candidate email"),
  manuallyAdded: z
    .boolean()
    .optional()
    .describe(
      "True returns only candidates added manually/via integration; false returns those who applied actively"
    ),
});

export const ListWebhooksParamsSchema = z.object({
  ...Pagination,
});

export const CreateWebhookParamsSchema = z.object({
  url: z.string().url().describe("Webhook target URL"),
  event: z
    .string()
    .describe(
      "Event name (e.g. 'application.created', 'candidate.hired', 'job.published')"
    ),
  enabled: z.boolean().optional().default(true),
  headers: z
    .record(z.string())
    .optional()
    .describe("Optional HTTP headers sent with the webhook"),
});

export const DeleteWebhookParamsSchema = z.object({
  webhookId: z.union([z.string(), z.number()]).describe("Webhook ID"),
});

export type RawRequestParams = z.infer<typeof RawRequestParamsSchema>;
export type ListJobsParams = z.infer<typeof ListJobsParamsSchema>;
export type GetJobParams = z.infer<typeof GetJobParamsSchema>;
export type UpdateJobStatusParams = z.infer<typeof UpdateJobStatusParamsSchema>;
export type ListApplicationsParams = z.infer<
  typeof ListApplicationsParamsSchema
>;
export type ListApplicationExperiencesParams = z.infer<
  typeof ListApplicationExperiencesParamsSchema
>;
export type MoveApplicationParams = z.infer<typeof MoveApplicationParamsSchema>;
export type CreateApplicationCommentParams = z.infer<
  typeof CreateApplicationCommentParamsSchema
>;
export type ListApplicationCommentsParams = z.infer<
  typeof ListApplicationCommentsParamsSchema
>;
export type TagApplicationParams = z.infer<typeof TagApplicationParamsSchema>;
export type SendCandidateMessageParams = z.infer<
  typeof SendCandidateMessageParamsSchema
>;
export type ListCandidatesParams = z.infer<typeof ListCandidatesParamsSchema>;
export type ListWebhooksParams = z.infer<typeof ListWebhooksParamsSchema>;
export type CreateWebhookParams = z.infer<typeof CreateWebhookParamsSchema>;
export type DeleteWebhookParams = z.infer<typeof DeleteWebhookParamsSchema>;

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export class GupyMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "GupyMCPError";
  }
}
