import { describe, expect, it } from "vitest";
import { OAuthProvider } from "./oauth-provider.js";

describe("OAuthProvider", () => {
  const oauth = new OAuthProvider({
    signingSecret: "signing-key-with-at-least-32-characters",
    issuer: () => "https://superauthor-us.example.com",
    googleSignIn: { clientId: "client", clientSecret: "secret" },
    isAllowedEmail: (email) => email === "louise@superauthor.com",
  });

  it("owns the discovery and flow endpoints", () => {
    for (const pathname of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-authorization-server",
      "/oauth/register",
      "/oauth/authorize",
      "/oauth/consent",
      "/oauth/google/callback",
      "/oauth/token",
    ]) {
      expect(oauth.handles(pathname)).toBe(true);
    }
    expect(oauth.handles("/mcp")).toBe(false);
  });

  it("rejects tokens it did not sign", () => {
    expect(oauth.resolveIdentity("not-a-token")).toBeNull();
    expect(oauth.resolveIdentity("")).toBeNull();
  });
});
