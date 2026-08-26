import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SCOPES, ServiceAccountAuth, buildAssertion } from "./auth.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const key = {
  client_email: "bot@project.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

describe("buildAssertion", () => {
  it("signs an RS256 JWT with the service account claims", () => {
    const assertion = buildAssertion(key, 1_000);
    const [header, claims, signature] = assertion.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iss: key.client_email,
      scope: SCOPES.join(" "),
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_000,
      exp: 4_600,
    });
    const verified = createVerify("RSA-SHA256")
      .update(`${header}.${claims}`)
      .verify(publicKey, Buffer.from(signature, "base64url"));
    expect(verified).toBe(true);
  });
});

describe("ServiceAccountAuth", () => {
  it("exchanges the assertion once and reuses the token until it is about to expire", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "tok", expires_in: 3600, token_type: "Bearer" }), { status: 200 })
    );
    let now = 0;
    const auth = new ServiceAccountAuth(key, fetchImpl as unknown as typeof fetch, () => now);

    expect(await auth.accessToken()).toBe("tok");
    now = 3_500_000;
    expect(await auth.accessToken()).toBe("tok");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now = 3_545_000;
    await auth.accessToken();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("surfaces the token endpoint error", async () => {
    const fetchImpl = vi.fn(async () => new Response("invalid_grant", { status: 400 }));
    const auth = new ServiceAccountAuth(key, fetchImpl as unknown as typeof fetch);
    await expect(auth.accessToken()).rejects.toThrow("token exchange failed (400): invalid_grant");
  });
});
