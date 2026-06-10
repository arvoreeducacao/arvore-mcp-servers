import { GupyClient } from "./gupy-client.js";
import {
  RawRequestParams,
  ListJobsParams,
  GetJobParams,
  UpdateJobStatusParams,
  ListApplicationsParams,
  ListApplicationExperiencesParams,
  MoveApplicationParams,
  CreateApplicationCommentParams,
  ListApplicationCommentsParams,
  TagApplicationParams,
  SendCandidateMessageParams,
  ListCandidatesParams,
  ListWebhooksParams,
  CreateWebhookParams,
  DeleteWebhookParams,
  McpToolResult,
  GupyMCPError,
} from "./types.js";

export class GupyMCPTools {
  constructor(private readonly client: GupyClient) {}

  async rawRequest(params: RawRequestParams): Promise<McpToolResult> {
    try {
      const data = await this.client.request<unknown>(
        params.method,
        params.path,
        params.body,
        params.query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async listJobs(params: ListJobsParams): Promise<McpToolResult> {
    try {
      const query = this.cleanQuery({
        limit: params.limit,
        offset: params.offset,
        status: params.status,
        code: params.code,
        name: params.name,
      });
      const data = await this.client.request<unknown>(
        "GET",
        "/api/v1/jobs",
        undefined,
        query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async getJob(params: GetJobParams): Promise<McpToolResult> {
    try {
      const data = await this.client.request<unknown>(
        "GET",
        `/api/v1/jobs/${params.jobId}`
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async updateJobStatus(
    params: UpdateJobStatusParams
  ): Promise<McpToolResult> {
    try {
      const data = await this.client.request<unknown>(
        "PATCH",
        `/api/v1/jobs/${params.jobId}`,
        { status: params.status }
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async listApplications(
    params: ListApplicationsParams
  ): Promise<McpToolResult> {
    try {
      const query = this.cleanQuery({
        limit: params.limit,
        offset: params.offset,
        currentStep: params.currentStep,
        status: params.status,
        fields: params.fields,
      });
      const data = await this.client.request<unknown>(
        "GET",
        `/api/v1/jobs/${params.jobId}/applications`,
        undefined,
        query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async listApplicationExperiences(
    params: ListApplicationExperiencesParams
  ): Promise<McpToolResult> {
    try {
      const query = this.cleanQuery({
        limit: params.limit,
        offset: params.offset,
        currentStep: params.currentStep,
        status: params.status,
        fields: "all",
      });
      const data = await this.client.request<unknown>(
        "GET",
        `/api/v1/jobs/${params.jobId}/applications`,
        undefined,
        query
      );
      return this.ok(this.extractExperiences(data));
    } catch (error) {
      return this.formatError(error);
    }
  }

  async moveApplication(
    params: MoveApplicationParams
  ): Promise<McpToolResult> {
    try {
      const body: Record<string, unknown> = { step: params.step };
      if (params.status) body.status = params.status;
      const data = await this.client.request<unknown>(
        "PATCH",
        `/api/v1/jobs/${params.jobId}/applications/${params.applicationId}`,
        body
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async createApplicationComment(
    params: CreateApplicationCommentParams
  ): Promise<McpToolResult> {
    try {
      const data = await this.client.request<unknown>(
        "POST",
        `/api/v1/jobs/${params.jobId}/applications/${params.applicationId}/comments`,
        { comment: params.comment }
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async listApplicationComments(
    params: ListApplicationCommentsParams
  ): Promise<McpToolResult> {
    try {
      const query = this.cleanQuery({
        limit: params.limit,
        offset: params.offset,
      });
      const data = await this.client.request<unknown>(
        "GET",
        `/api/v1/jobs/${params.jobId}/applications/${params.applicationId}/comments`,
        undefined,
        query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async tagApplication(params: TagApplicationParams): Promise<McpToolResult> {
    try {
      const data = await this.client.request<unknown>(
        "PUT",
        `/api/v1/jobs/${params.jobId}/applications/${params.applicationId}/tags`,
        { tags: params.tags }
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async sendCandidateMessage(
    params: SendCandidateMessageParams
  ): Promise<McpToolResult> {
    try {
      const data = await this.client.request<unknown>(
        "POST",
        `/api/v1/jobs/${params.jobId}/applications/${params.applicationId}/messages`,
        { subject: params.subject, body: params.body }
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async listCandidates(params: ListCandidatesParams): Promise<McpToolResult> {
    try {
      const query = this.cleanQuery({
        limit: params.limit,
        offset: params.offset,
        email: params.email,
        manuallyAdded:
          params.manuallyAdded === undefined
            ? undefined
            : String(params.manuallyAdded),
      });
      const data = await this.client.request<unknown>(
        "GET",
        "/api/v2/candidates",
        undefined,
        query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async listWebhooks(params: ListWebhooksParams): Promise<McpToolResult> {
    try {
      const query = this.cleanQuery({
        limit: params.limit,
        offset: params.offset,
      });
      const data = await this.client.request<unknown>(
        "GET",
        "/api/v1/webhooks",
        undefined,
        query
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async createWebhook(params: CreateWebhookParams): Promise<McpToolResult> {
    try {
      const body: Record<string, unknown> = {
        url: params.url,
        event: params.event,
        enabled: params.enabled ?? true,
      };
      if (params.headers) body.headers = params.headers;
      const data = await this.client.request<unknown>(
        "POST",
        "/api/v1/webhooks",
        body
      );
      return this.ok(data);
    } catch (error) {
      return this.formatError(error);
    }
  }

  async deleteWebhook(params: DeleteWebhookParams): Promise<McpToolResult> {
    try {
      await this.client.request<unknown>(
        "DELETE",
        `/api/v1/webhooks/${params.webhookId}`
      );
      return this.ok({
        success: true,
        message: `Webhook ${params.webhookId} deleted.`,
      });
    } catch (error) {
      return this.formatError(error);
    }
  }

  private extractExperiences(data: unknown): unknown {
    const root = data as Record<string, unknown> | null;
    const list = Array.isArray(root?.data)
      ? (root?.data as unknown[])
      : Array.isArray(data)
        ? (data as unknown[])
        : [];

    const applications = list.map((item) => {
      const application = item as Record<string, unknown>;
      const candidate =
        (application.candidate as Record<string, unknown> | undefined) ?? {};
      const rawExperiences = Array.isArray(candidate.workExperience)
        ? (candidate.workExperience as Record<string, unknown>[])
        : [];

      const workExperience = rawExperiences.map((experience) => ({
        role: experience.role ?? null,
        companyName: experience.companyName ?? null,
        activitiesPerformed: experience.activitiesPerformed ?? null,
        startMonth: experience.startMonth ?? null,
        startYear: experience.startYear ?? null,
        endMonth: experience.endMonth ?? null,
        endYear: experience.endYear ?? null,
      }));

      return {
        applicationId: application.id ?? null,
        candidateName: candidate.name ?? null,
        candidateEmail: candidate.email ?? null,
        schooling: candidate.schooling ?? null,
        schoolingStatus: candidate.schoolingStatus ?? null,
        workExperience,
      };
    });

    return {
      summary: {
        total: applications.length,
        withExperience: applications.filter(
          (application) => application.workExperience.length > 0
        ).length,
      },
      applications,
    };
  }

  private cleanQuery(
    obj: Record<string, string | number | boolean | undefined>
  ): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      out[k] = v;
    }
    return out;
  }

  private ok(data: unknown): McpToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }

  private formatError(error: unknown): McpToolResult {
    let message: string;
    if (error instanceof GupyMCPError) {
      message = `Gupy Error: ${error.message}`;
    } else if (error instanceof Error) {
      message = `Unexpected error: ${error.message}`;
    } else {
      message = "Unexpected error: Unknown error";
    }
    return {
      content: [
        { type: "text", text: JSON.stringify({ error: message }, null, 2) },
      ],
    };
  }
}
