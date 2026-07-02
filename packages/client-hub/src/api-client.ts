import { ClientHubConfig, ClientHubMCPError } from "./types.js";

const TOKEN_EXCHANGE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:token-exchange";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
        throw new ClientHubMCPError(
          `Token exchange failed: ${res.status}`,
          "TOKEN_EXCHANGE_ERROR",
          await res.text().catch(() => undefined)
        );
      }

      const data = (await res.json()) as {
        access_token: string;
        expires_in: number;
      };

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

    const totalAttempts = (this.config.maxRetries ?? 0) + 1;
    let lastError: ClientHubMCPError | undefined;

    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      try {
        return await this.attemptRequest(method, url, resolvedToken);
      } catch (error) {
        const normalized =
          error instanceof ClientHubMCPError
            ? error
            : new ClientHubMCPError(
                "Client Hub API unreachable",
                "UNREACHABLE",
                error instanceof Error ? error.message : String(error)
              );

        if (!this.isRetryable(normalized) || attempt === totalAttempts) {
          throw normalized;
        }

        lastError = normalized;
        const baseDelay = this.config.retryBaseDelay ?? 500;
        const backoff =
          baseDelay * 2 ** (attempt - 1) +
          Math.floor(Math.random() * baseDelay);
        await delay(backoff);
      }
    }

    throw (
      lastError ??
      new ClientHubMCPError("Client Hub API unreachable", "UNREACHABLE")
    );
  }

  private isRetryable(error: ClientHubMCPError): boolean {
    if (error.code === "UNREACHABLE" || error.code === "TIMEOUT") {
      return true;
    }
    if (error.code === "API_ERROR") {
      const status = Number.parseInt(
        error.message.replace(/\D/g, "") || "0",
        10
      );
      return status === 429 || status >= 500;
    }
    return false;
  }

  private async attemptRequest(
    method: "GET",
    url: string,
    resolvedToken: string
  ): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.requestTimeout);

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
        throw new ClientHubMCPError(
          `Client Hub API error: ${res.status}`,
          "API_ERROR",
          await res.text().catch(() => undefined)
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
      if (timedOut) {
        throw new ClientHubMCPError(
          `Client Hub API timed out after ${this.config.requestTimeout}ms`,
          "TIMEOUT",
          error instanceof Error ? error.message : String(error)
        );
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
