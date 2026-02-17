import {
  LaunchDarklyConfig,
  LaunchDarklyMCPError,
} from "./types.js";

export class LaunchDarklyClient {
  private cookies: Map<string, string> = new Map();
  private authenticated = false;

  constructor(private config: LaunchDarklyConfig) {}

  private parseCookiesFromHeaders(headers: Headers): void {
    const setCookies = headers.getSetCookie();
    for (const cookie of setCookies) {
      const [pair] = cookie.split(";");
      const eqIndex = pair.indexOf("=");
      if (eqIndex > 0) {
        const name = pair.substring(0, eqIndex).trim();
        const value = pair.substring(eqIndex + 1).trim();
        this.cookies.set(name, value);
      }
    }
  }

  private getCookieString(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async authenticate(): Promise<void> {
    try {
      const step1 = await fetch(
        `${this.config.baseUrl}/internal/account/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            email: this.config.email,
            password: this.config.password,
            redirect: "/",
          }),
          redirect: "manual",
        }
      );

      if (step1.status >= 400) {
        const body = await step1.text().catch(() => "");
        throw new LaunchDarklyMCPError(
          `Login step 1 failed: ${step1.status} - ${body}`,
          "AUTH_STEP1_ERROR",
          step1.status
        );
      }

      this.parseCookiesFromHeaders(step1.headers);

      const step2 = await fetch(
        `${this.config.baseUrl}/internal/account/login2`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Cookie: this.getCookieString(),
          },
          body: JSON.stringify({
            email: this.config.email,
            redirect: "/",
          }),
          redirect: "manual",
        }
      );

      if (step2.status >= 400) {
        const body = await step2.text().catch(() => "");
        throw new LaunchDarklyMCPError(
          `Login step 2 failed: ${step2.status} - ${body}`,
          "AUTH_STEP2_ERROR",
          step2.status
        );
      }

      this.parseCookiesFromHeaders(step2.headers);

      const hasSession =
        this.cookies.has("ldso") ||
        this.cookies.has("pa_ldso") ||
        this.cookies.has("ob_ldso");

      if (!hasSession) {
        throw new LaunchDarklyMCPError(
          "No session cookies received after login",
          "AUTH_NO_SESSION"
        );
      }

      this.authenticated = true;
      console.error("LaunchDarkly authentication successful");
    } catch (error) {
      if (error instanceof LaunchDarklyMCPError) throw error;
      throw new LaunchDarklyMCPError(
        `Authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "AUTH_ERROR"
      );
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request<unknown>("/api/v2/projects?limit=1");
      return true;
    } catch {
      return false;
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.authenticated) {
      await this.authenticate();
    }
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
      ldApiVersion?: string;
    } = {},
    retried = false
  ): Promise<T> {
    await this.ensureAuthenticated();

    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      Cookie: this.getCookieString(),
      ...options.headers,
    };

    if (options.ldApiVersion) {
      headers["LD-API-Version"] = options.ldApiVersion;
    }

    if (options.body) {
      headers["Content-Type"] =
        headers["Content-Type"] || "application/json";
    }

    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: "manual",
    });

    this.parseCookiesFromHeaders(response.headers);

    if (response.status === 401 && !retried) {
      console.error("Session expired, re-authenticating...");
      this.authenticated = false;
      this.cookies.clear();
      await this.authenticate();
      return this.request<T>(path, options, true);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new LaunchDarklyMCPError(
        `API request failed: ${response.status} ${response.statusText} - ${body}`,
        "API_ERROR",
        response.status
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }

  async listFlags(
    projectKey: string,
    options: {
      env?: string;
      limit?: number;
      offset?: number;
      filter?: string;
      sort?: string;
    } = {}
  ): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
    const params = new URLSearchParams();
    if (options.env) params.set("env", options.env);
    if (options.limit) params.set("limit", String(options.limit));
    if (options.offset) params.set("offset", String(options.offset));
    if (options.filter) params.set("filter", options.filter);
    params.set("summary", "true");
    params.set("sort", options.sort || "-creationDate");
    params.set("expand", "archiveChecks");

    const query = params.toString();
    return this.request(
      `/internal/flags/${encodeURIComponent(projectKey)}?${query}`,
      { ldApiVersion: "20240415" }
    );
  }

  async getFlag(
    projectKey: string,
    flagKey: string,
    env?: string
  ): Promise<Record<string, unknown>> {
    const params = new URLSearchParams();
    if (env) params.set("env", env);

    const query = params.toString();
    return this.request(
      `/api/v2/flags/${encodeURIComponent(projectKey)}/${encodeURIComponent(flagKey)}${query ? `?${query}` : ""}`
    );
  }

  async toggleFlag(
    projectKey: string,
    flagKey: string,
    envKey: string,
    state: boolean
  ): Promise<Record<string, unknown>> {
    return this.request(
      `/api/v2/flags/${encodeURIComponent(projectKey)}/${encodeURIComponent(flagKey)}?ignoreConflicts=true`,
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json; domain-model=launchdarkly.semanticpatch",
        },
        body: {
          comment: "",
          environmentKey: envKey,
          instructions: [
            { kind: state ? "turnFlagOn" : "turnFlagOff" },
          ],
        },
      }
    );
  }

  async createFlag(
    projectKey: string,
    data: {
      name: string;
      key: string;
      description?: string;
      tags?: string[];
      temporary?: boolean;
    }
  ): Promise<Record<string, unknown>> {
    return this.request(
      `/api/v2/flags/${encodeURIComponent(projectKey)}`,
      {
        method: "POST",
        body: {
          name: data.name,
          key: data.key,
          description: data.description || "",
          temporary: data.temporary ?? true,
          tags: data.tags || [],
          clientSideAvailability: {
            usingMobileKey: false,
            usingEnvironmentId: false,
          },
          variations: [
            { name: "true", value: true, description: "" },
            { name: "false", value: false, description: "" },
          ],
          defaults: { onVariation: 0, offVariation: 1 },
        },
      }
    );
  }

  async getFlagStatuses(
    projectKey: string,
    flagKeys: string[],
    environmentKeys: string[]
  ): Promise<Record<string, unknown>> {
    return this.request(
      `/api/v2/projects/${encodeURIComponent(projectKey)}/flag-statuses/query`,
      {
        method: "POST",
        body: { flagKeys, environmentKeys },
        ldApiVersion: "beta",
      }
    );
  }

  async listProjects(): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
    return this.request("/api/v2/projects");
  }

  async updateFlagTargeting(
    projectKey: string,
    flagKey: string,
    envKey: string,
    instructions: Record<string, unknown>[],
    comment = ""
  ): Promise<Record<string, unknown>> {
    return this.request(
      `/api/v2/flags/${encodeURIComponent(projectKey)}/${encodeURIComponent(flagKey)}?ignoreConflicts=true`,
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json; domain-model=launchdarkly.semanticpatch",
        },
        body: {
          comment,
          environmentKey: envKey,
          instructions,
        },
      }
    );
  }

  async deleteFlag(
    projectKey: string,
    flagKey: string
  ): Promise<void> {
    await this.request(
      `/api/v2/flags/${encodeURIComponent(projectKey)}/${encodeURIComponent(flagKey)}`,
      { method: "DELETE" }
    );
  }

  async listSegments(
    projectKey: string,
    envKey: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ items: Record<string, unknown>[]; totalCount: number }> {
    const params = new URLSearchParams();
    if (options.limit) params.set("limit", String(options.limit));
    if (options.offset) params.set("offset", String(options.offset));

    const query = params.toString();
    return this.request(
      `/api/v2/segments/${encodeURIComponent(projectKey)}/${encodeURIComponent(envKey)}${query ? `?${query}` : ""}`
    );
  }

  async getSegment(
    projectKey: string,
    envKey: string,
    segmentKey: string
  ): Promise<Record<string, unknown>> {
    return this.request(
      `/api/v2/segments/${encodeURIComponent(projectKey)}/${encodeURIComponent(envKey)}/${encodeURIComponent(segmentKey)}`
    );
  }

  async listEnvironments(
    projectKey: string
  ): Promise<{ items: Record<string, unknown>[] }> {
    return this.request(
      `/internal/projects/${encodeURIComponent(projectKey)}/environments`
    );
  }
}
