import { ClientHubConfig, ClientHubMCPError } from "./types.js";

const TOKEN_EXCHANGE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:token-exchange";

export class ClientHubApiClient {
  private readonly legacyTokenCache = new Map<
    string,
    { token: string; expiresAt: number }
  >();

  constructor(private readonly config: ClientHubConfig) {}

  async testConnection(): Promise<boolean> {
    try {
      await this.request("GET", "v1/client-hub/clients", { limit: "1" });
      return true;
    } catch {
      return false;
    }
  }

  private async resolveToken(identityToken: string): Promise<string> {
    const now = Date.now();
    const cached = this.legacyTokenCache.get(identityToken);
    if (cached && cached.expiresAt > now + 60_000) {
      return cached.token;
    }

    const exchangeUrl = `${this.config.apiBaseUrl}/oauth2/token/exchange`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeout);

    try {
      const res = await fetch(exchangeUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
          subject_token: identityToken,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) {
        const detail = await res.text().catch(() => undefined);
        console.error(
          `[exchange] FAILED status=${res.status} body=${(detail || "").slice(0, 400)}`
        );
        throw new ClientHubMCPError(
          `Token exchange failed: ${res.status}`,
          "TOKEN_EXCHANGE_ERROR",
          detail
        );
      }

      const data = (await res.json()) as {
        access_token: string;
        expires_in: number;
      };

      console.error(
        `[exchange] OK legacyTokenLen=${data.access_token?.length} expiresIn=${data.expires_in}`
      );

      this.legacyTokenCache.set(identityToken, {
        token: data.access_token,
        expiresAt: now + data.expires_in * 1000,
      });

      return data.access_token;
    } catch (error) {
      if (error instanceof ClientHubMCPError) throw error;
      throw new ClientHubMCPError(
        "Token exchange unreachable",
        "TOKEN_EXCHANGE_ERROR",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async request(
    method: "GET",
    path: string,
    query?: Record<string, string | undefined>,
    authToken?: string
  ): Promise<unknown> {
    const resolvedToken = authToken
      ? await this.resolveToken(authToken)
      : this.config.apiToken;

    if (!resolvedToken) {
      throw new ClientHubMCPError(
        "No auth token available for Client Hub API request",
        "NO_AUTH_TOKEN"
      );
    }

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
          authorization: `Bearer ${resolvedToken}`,
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const errDetail = await res.text().catch(() => undefined);
        console.error(
          `[api] ${path} FAILED status=${res.status} tokenLen=${resolvedToken?.length} body=${(errDetail || "").slice(0, 400)}`
        );
        throw new ClientHubMCPError(
          `Client Hub API error: ${res.status}`,
          "API_ERROR",
          errDetail
        );
      }

      const body = await res.text();

      if (body.trim() === "") {
        return null;
      }

      try {
        return JSON.parse(body);
      } catch {
        throw new ClientHubMCPError(
          "Client Hub API returned an invalid JSON response",
          "INVALID_RESPONSE",
          body.slice(0, 500)
        );
      }
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
