export interface PostHogConfig {
  baseUrl: string;
  apiKey: string;
  projectId?: string;
}

export class PostHogClient {
  private baseUrl: string;
  private apiKey: string;
  private projectId: string;

  constructor(config: PostHogConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.projectId = config.projectId || "1";
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `PostHog API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request("GET", "/api/projects/");
      return true;
    } catch {
      return false;
    }
  }

  async listProjects(): Promise<unknown> {
    return this.request("GET", "/api/projects/");
  }

  async getProject(projectId?: string): Promise<unknown> {
    return this.request("GET", `/api/projects/${projectId || this.projectId}/`);
  }

  async listFeatureFlags(params?: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.search) qs.set("search", params.search);
    const query = qs.toString();
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/feature_flags/${query ? `?${query}` : ""}`
    );
  }

  async getFeatureFlag(id: number): Promise<unknown> {
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/feature_flags/${id}/`
    );
  }

  async createFeatureFlag(data: {
    key: string;
    name?: string;
    active?: boolean;
    filters?: unknown;
    rollout_percentage?: number;
  }): Promise<unknown> {
    return this.request(
      "POST",
      `/api/projects/${this.projectId}/feature_flags/`,
      data
    );
  }

  async updateFeatureFlag(
    id: number,
    data: {
      key?: string;
      name?: string;
      active?: boolean;
      filters?: unknown;
      rollout_percentage?: number;
    }
  ): Promise<unknown> {
    return this.request(
      "PATCH",
      `/api/projects/${this.projectId}/feature_flags/${id}/`,
      data
    );
  }

  async deleteFeatureFlag(id: number): Promise<unknown> {
    return this.request(
      "DELETE",
      `/api/projects/${this.projectId}/feature_flags/${id}/`
    );
  }

  async listExperiments(params?: {
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/experiments/${query ? `?${query}` : ""}`
    );
  }

  async getExperiment(id: number): Promise<unknown> {
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/experiments/${id}/`
    );
  }

  async listInsights(params?: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.search) qs.set("search", params.search);
    const query = qs.toString();
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/insights/${query ? `?${query}` : ""}`
    );
  }

  async getInsight(id: number): Promise<unknown> {
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/insights/${id}/`
    );
  }

  async listDashboards(params?: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.search) qs.set("search", params.search);
    const query = qs.toString();
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/dashboards/${query ? `?${query}` : ""}`
    );
  }

  async getDashboard(id: number): Promise<unknown> {
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/dashboards/${id}/`
    );
  }

  async executeQuery(query: unknown): Promise<unknown> {
    return this.request(
      "POST",
      `/api/projects/${this.projectId}/query/`,
      { query }
    );
  }

  async executeSql(sql: string): Promise<unknown> {
    return this.executeQuery({
      kind: "HogQLQuery",
      query: sql,
    });
  }

  async listEventDefinitions(params?: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.search) qs.set("search", params.search);
    const query = qs.toString();
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/event_definitions/${query ? `?${query}` : ""}`
    );
  }

  async listPropertyDefinitions(params?: {
    limit?: number;
    offset?: number;
    type?: "event" | "person";
    search?: string;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.type) qs.set("type", params.type);
    if (params?.search) qs.set("search", params.search);
    const query = qs.toString();
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/property_definitions/${query ? `?${query}` : ""}`
    );
  }

  async listCohorts(params?: {
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/cohorts/${query ? `?${query}` : ""}`
    );
  }

  async listAnnotations(params?: {
    limit?: number;
    offset?: number;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/annotations/${query ? `?${query}` : ""}`
    );
  }

  async createAnnotation(data: {
    content: string;
    date_marker: string;
    scope?: "project" | "organization";
  }): Promise<unknown> {
    return this.request(
      "POST",
      `/api/projects/${this.projectId}/annotations/`,
      data
    );
  }

  async listPersons(params?: {
    limit?: number;
    offset?: number;
    search?: string;
    distinct_id?: string;
  }): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.search) qs.set("search", params.search);
    if (params?.distinct_id) qs.set("distinct_id", params.distinct_id);
    const query = qs.toString();
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/persons/${query ? `?${query}` : ""}`
    );
  }

  async listSurveys(): Promise<unknown> {
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/surveys/`
    );
  }

  async listEarlyAccessFeatures(): Promise<unknown> {
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/early_access_feature/`
    );
  }

  async createInsight(data: {
    name: string;
    description?: string;
    query?: unknown;
    dashboards?: number[];
    saved?: boolean;
  }): Promise<unknown> {
    return this.request(
      "POST",
      `/api/projects/${this.projectId}/insights/`,
      data
    );
  }

  async updateDashboard(
    id: number,
    data: {
      name?: string;
      description?: string;
      pinned?: boolean;
      tags?: string[];
    }
  ): Promise<unknown> {
    return this.request(
      "PATCH",
      `/api/projects/${this.projectId}/dashboards/${id}/`,
      data
    );
  }

  async search(query: string, entities?: string[]): Promise<unknown> {
    const qs = new URLSearchParams();
    qs.set("q", query);
    if (entities) {
      for (const entity of entities) {
        qs.append("entities", entity);
      }
    }
    return this.request(
      "GET",
      `/api/projects/${this.projectId}/search/?${qs.toString()}`
    );
  }
}
