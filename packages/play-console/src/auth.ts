import { createSign } from "node:crypto";
import { PlayConsoleMCPError, ServiceAccountKey } from "./types.js";

export const SCOPES = [
  "https://www.googleapis.com/auth/playdeveloperreporting",
  "https://www.googleapis.com/auth/androidpublisher",
];

const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const TOKEN_LIFETIME_SECONDS = 3600;
const REFRESH_MARGIN_SECONDS = 60;

interface CachedToken {
  token: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function buildAssertion(
  key: ServiceAccountKey,
  nowSeconds: number,
  scopes: string[] = SCOPES
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: scopes.join(" "),
      aud: key.token_uri || DEFAULT_TOKEN_URI,
      iat: nowSeconds,
      exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
    })
  );
  const signingInput = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(key.private_key);
  return `${signingInput}.${base64url(signature)}`;
}

export class ServiceAccountAuth {
  private cached: CachedToken | null = null;

  constructor(
    private readonly key: ServiceAccountKey,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = () => Date.now()
  ) {}

  async accessToken(): Promise<string> {
    const nowMs = this.now();
    if (this.cached && this.cached.expiresAt - REFRESH_MARGIN_SECONDS * 1000 > nowMs) {
      return this.cached.token;
    }

    const assertion = buildAssertion(this.key, Math.floor(nowMs / 1000));
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    });
    const response = await this.fetchImpl(this.key.token_uri || DEFAULT_TOKEN_URI, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new PlayConsoleMCPError(
        `Service account token exchange failed (${response.status}): ${text}`,
        response.status
      );
    }
    const parsed = JSON.parse(text) as TokenResponse;
    this.cached = {
      token: parsed.access_token,
      expiresAt: nowMs + parsed.expires_in * 1000,
    };
    return parsed.access_token;
  }
}
