import { ClientHubConfig, ClientHubMCPError } from "./types.js";

export class ClientHubApiClient {
  constructor(private readonly config: ClientHubConfig) {}

  async testConnection(): Promise<boolean> {
    try {
      await this.request("GET", "v1/client-hub/clients", { limit: "1" });
      return true;
    } catch {
      return false;
    }
  }

  async request(
    method: "GET",
    path: string,
    query?: Record<string, string | undefined>
  ): Promise<unknown> {
    const params = query
      ? Object.entries(query)
          .filter(([, value]) => value !== undefined && value !== "")
          .map(
            ([key, value]) =>
              `${key}=${encodeURIComponent(value as string)}`
          )
          .join("&")
      : "";

    const url = `${this.config.apiBaseUrl}/${path}${params ? `?${params}` : ""}`;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.requestTimeout
    );

    try {
      const res = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.config.apiToken}`,
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new ClientHubMCPError(
          `Client Hub API error: ${res.status}`,
          "API_ERROR",
          await res.text().catch(() => undefined)
        );
      }

      return await res.json();
    } catch (error) {
      if (error instanceof ClientHubMCPError) {
        throw error;
      }
      throw new ClientHubMCPError(
        "Client Hub API unreachable",
        "UNREACHABLE",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
