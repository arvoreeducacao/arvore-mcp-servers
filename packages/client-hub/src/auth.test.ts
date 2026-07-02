import { describe, it, expect, beforeAll, vi } from "vitest";
import { SignJWT, generateKeyPair, exportJWK, type KeyLike } from "jose";

vi.mock("jose", async () => {
  const actual = await vi.importActual<typeof import("jose")>("jose");
  return {
    ...actual,
    createRemoteJWKSet: () => publicKey,
  };
});

let publicKey: KeyLike;
let privateKey: KeyLike;

const config = {
  issuer: "https://auth.arvore.com.br",
  jwksUri: "https://auth.arvore.com.br/jwks",
  audience: "https://client-hub-mcp.arvore.dev/mcp",
  resourceUrl: "https://client-hub-mcp.arvore.dev/mcp",
  authorizationServers: ["https://auth.arvore.com.br"],
  requiredScopes: ["openid", "profile", "email"],
  authorizationEndpoint: "https://auth.arvore.com.br/authorize",
  tokenEndpoint: "https://auth.arvore.com.br/token",
  clientId: "client-hub-mcp-claude",
  redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
};

async function makeToken(
  overrides: { exp?: string; issuer?: string; audience?: string } = {}
): Promise<string> {
  const token = new SignJWT({ scope: "openid profile email", email: "a@b.com" })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("User:1")
    .setIssuedAt()
    .setIssuer(overrides.issuer ?? config.issuer)
    .setAudience(overrides.audience ?? config.audience)
    .setExpirationTime(overrides.exp ?? "1h");
  return token.sign(privateKey);
}

describe("createTokenVerifier", () => {
  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    publicKey = pair.publicKey;
    privateKey = pair.privateKey;
    await exportJWK(publicKey);
  });

  it("accepts a valid token and returns AuthInfo", async () => {
    const { createTokenVerifier } = await import("./auth.js");
    const verifier = createTokenVerifier(config);
    const token = await makeToken();

    const info = await verifier.verifyAccessToken(token);
    expect(info.token).toBe(token);
    expect(info.scopes).toEqual(["openid", "profile", "email"]);
    expect(info.extra?.sub).toBe("User:1");
  });

  it("rejects an expired token as InvalidTokenError", async () => {
    const { createTokenVerifier } = await import("./auth.js");
    const { InvalidTokenError } = await import(
      "@modelcontextprotocol/sdk/server/auth/errors.js"
    );
    const verifier = createTokenVerifier(config);
    const token = await makeToken({ exp: "-1h" });

    await expect(verifier.verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });

  it("rejects a garbage token as InvalidTokenError (not a 500)", async () => {
    const { createTokenVerifier } = await import("./auth.js");
    const { InvalidTokenError } = await import(
      "@modelcontextprotocol/sdk/server/auth/errors.js"
    );
    const verifier = createTokenVerifier(config);

    await expect(
      verifier.verifyAccessToken("aaa.bbb.ccc")
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("rejects a token with wrong issuer as InvalidTokenError", async () => {
    const { createTokenVerifier } = await import("./auth.js");
    const { InvalidTokenError } = await import(
      "@modelcontextprotocol/sdk/server/auth/errors.js"
    );
    const verifier = createTokenVerifier(config);
    const token = await makeToken({ issuer: "https://evil.example.com" });

    await expect(verifier.verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidTokenError
    );
  });
});
