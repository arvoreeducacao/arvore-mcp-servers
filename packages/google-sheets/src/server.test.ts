import { describe, expect, it } from "vitest";
import { GoogleSheetsMCPServer } from "./server.js";
import { OAuthProvider } from "./oauth-provider.js";

const CLIENT = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
};

function server() {
  return new GoogleSheetsMCPServer({
    client: CLIENT,
    transport: "stdio",
    host: "127.0.0.1",
    port: 0,
    authToken: "token-with-at-least-16-chars",
    signingKey: "signing-key-with-at-least-32-characters",
  });
}

describe("GoogleSheetsMCPServer", () => {
  it("builds with a service identity", () => {
    expect(server()).toBeInstanceOf(GoogleSheetsMCPServer);
  });

  it("builds without one, for OAuth-only deployments", () => {
    expect(
      new GoogleSheetsMCPServer({
        client: null,
        transport: "http",
        host: "127.0.0.1",
        port: 0,
        authToken: "token-with-at-least-16-chars",
        signingKey: "signing-key-with-at-least-32-characters",
      })
    ).toBeInstanceOf(GoogleSheetsMCPServer);
  });
});

describe("OAuthProvider routing", () => {
  const oauth = new OAuthProvider({
    sharedSecret: "token-with-at-least-16-chars",
    signingSecret: "signing-key-with-at-least-32-characters",
    issuer: () => "https://sheets-mcp.example.com",
  });

  it("owns the discovery and flow endpoints", () => {
    for (const pathname of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-authorization-server",
      "/oauth/register",
      "/oauth/authorize",
      "/oauth/consent",
      "/oauth/token",
      "/oauth/google/callback",
    ]) {
      expect(oauth.handles(pathname)).toBe(true);
    }
  });

  it("leaves the MCP endpoint and the health check alone", () => {
    expect(oauth.handles("/mcp")).toBe(false);
    expect(oauth.handles("/health")).toBe(false);
  });

  it("rejects a token it never issued", () => {
    expect(oauth.verifyAccessToken("not-a-token")).toBe(false);
    expect(oauth.resolveIdentity("not-a-token")).toBeNull();
  });
});
