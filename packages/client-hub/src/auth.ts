import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";

export interface OAuthConfig {
  issuer: string;
  jwksUri: string;
  audience?: string;
  resourceUrl: string;
  authorizationServers: string[];
  requiredScopes: string[];
}

export function oauthConfigFromEnvironment(): OAuthConfig {
  const issuer = process.env.OAUTH_ISSUER || "https://auth.arvore.com.br";
  const jwksUri =
    process.env.OAUTH_JWKS_URI || `${issuer}/api-arvore/oauth2/jwks`;
  const resourceUrl =
    process.env.OAUTH_RESOURCE_URL || "https://client-hub-mcp.arvore.dev/mcp";
  const audience = process.env.OAUTH_AUDIENCE || resourceUrl;
  const requiredScopes = (process.env.OAUTH_REQUIRED_SCOPES || "")
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

  return {
    issuer,
    jwksUri,
    audience,
    resourceUrl,
    authorizationServers: [issuer],
    requiredScopes,
  };
}

export function createTokenVerifier(config: OAuthConfig): OAuthTokenVerifier {
  const jwks = createRemoteJWKSet(new URL(config.jwksUri));

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.audience,
      });

      const scopes =
        typeof payload.scope === "string"
          ? payload.scope.split(" ").filter((scope) => scope.length > 0)
          : [];

      return {
        token,
        clientId: typeof payload.aud === "string" ? payload.aud : config.issuer,
        scopes,
        expiresAt: payload.exp,
        extra: {
          sub: payload.sub,
          email: payload.email,
          activeProfileId: payload.active_profile_id,
        },
      };
    },
  };
}

export function extractAuthToken(extra: {
  authInfo?: { token?: string };
}): string | undefined {
  return extra.authInfo?.token;
}
