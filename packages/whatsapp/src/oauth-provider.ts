import { createHash, timingSafeEqual } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";
import { seal, unseal } from "./sealed.js";

const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleSignInConfig {
  clientId: string;
  clientSecret: string;
  allowedDomains: string[];
}

export interface ResolvedIdentity {
  email: string;
}

export interface OAuthProviderOptions {
  sharedSecret: string;
  issuer: () => string;
  googleSignIn?: GoogleSignInConfig;
}

interface ClientRecord {
  redirectUris: string[];
  issuedAt: number;
}

interface PendingAuthorization {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  issuedAt: number;
}

interface CodePayload {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  issuedAt: number;
  email?: string;
}

interface TokenPayload {
  kind: "access" | "refresh";
  clientId: string;
  issuedAt: number;
  expiresAt: number;
  email?: string;
}

export class OAuthProvider {
  private readonly allowedDomains: string[];
  private readonly redeemedCodes = new Map<string, number>();

  constructor(private options: OAuthProviderOptions) {
    if (!options.sharedSecret) {
      throw new Error("OAuthProvider requires a non-empty shared secret");
    }
    this.allowedDomains = (options.googleSignIn?.allowedDomains ?? []).map((domain) =>
      domain.trim().toLowerCase().replace(/^@/, "")
    );
  }

  handles(pathname: string): boolean {
    return (
      pathname.startsWith("/.well-known/oauth-protected-resource") ||
      pathname.startsWith("/.well-known/oauth-authorization-server") ||
      pathname === "/oauth/register" ||
      pathname === "/oauth/authorize" ||
      pathname === "/oauth/google/callback" ||
      pathname === "/oauth/token"
    );
  }

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const issuer = this.options.issuer();

    if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
      json(res, 200, {
        resource: `${issuer}/mcp`,
        authorization_servers: [issuer],
        bearer_methods_supported: ["header"],
        scopes_supported: ["mcp"],
      });
      return;
    }

    if (url.pathname.startsWith("/.well-known/oauth-authorization-server")) {
      json(res, 200, {
        issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/oauth/token`,
        registration_endpoint: `${issuer}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: ["mcp"],
      });
      return;
    }

    if (url.pathname === "/oauth/register") {
      await this.register(req, res);
      return;
    }

    if (url.pathname === "/oauth/authorize") {
      await this.authorize(req, res, url);
      return;
    }

    if (url.pathname === "/oauth/google/callback") {
      await this.googleCallback(res, url);
      return;
    }

    if (url.pathname === "/oauth/token") {
      await this.token(req, res);
      return;
    }

    json(res, 404, { error: "not_found" });
  }

  verifyAccessToken(token: string): boolean {
    const payload = this.decode<TokenPayload>(token, "token");
    if (!payload) return false;
    return payload.kind === "access" && payload.expiresAt > Date.now();
  }

  resolveIdentity(token: string): ResolvedIdentity | null {
    const payload = this.decode<TokenPayload>(token, "token");
    if (!payload || payload.kind !== "access" || payload.expiresAt <= Date.now()) return null;
    if (!payload.email) return null;
    return { email: payload.email };
  }

  private async register(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      json(res, 405, { error: "invalid_request" });
      return;
    }

    const body = (await readBody(req)) as { redirect_uris?: unknown; client_name?: unknown };
    const redirectUris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.filter((uri): uri is string => typeof uri === "string")
      : [];

    if (redirectUris.length === 0) {
      json(res, 400, {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris is required",
      });
      return;
    }

    for (const uri of redirectUris) {
      if (!isSafeRedirectUri(uri)) {
        json(res, 400, {
          error: "invalid_redirect_uri",
          error_description: `redirect_uri must be https or localhost: ${uri}`,
        });
        return;
      }
    }

    const record: ClientRecord = { redirectUris, issuedAt: Date.now() };

    json(res, 201, {
      client_id: this.encode(record, "client"),
      client_id_issued_at: Math.floor(record.issuedAt / 1000),
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      client_name: typeof body.client_name === "string" ? body.client_name : "mcp-client",
    });
  }

  private async authorize(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const params =
      req.method === "POST" ? new URLSearchParams(await readRawBody(req)) : url.searchParams;

    const clientId = params.get("client_id") || "";
    const redirectUri = params.get("redirect_uri") || "";
    const state = params.get("state") || "";
    const codeChallenge = params.get("code_challenge") || "";
    const codeChallengeMethod = params.get("code_challenge_method") || "";
    const resource = params.get("resource") || "";

    const client = this.decode<ClientRecord>(clientId, "client");
    if (!client) {
      json(res, 400, { error: "invalid_client" });
      return;
    }

    if (!client.redirectUris.includes(redirectUri)) {
      json(res, 400, {
        error: "invalid_request",
        error_description: "redirect_uri does not match the registered client",
      });
      return;
    }

    if (codeChallengeMethod !== "S256" || !codeChallenge) {
      redirectWithError(res, redirectUri, state, "invalid_request", "PKCE S256 is required");
      return;
    }

    const pending: PendingAuthorization = {
      clientId,
      redirectUri,
      state,
      codeChallenge,
      issuedAt: Date.now(),
    };

    const google = this.options.googleSignIn;
    const submittedToken = req.method === "POST" ? params.get("token") || "" : "";

    if (google && !submittedToken) {
      const target = new URL(GOOGLE_AUTH_URL);
      target.searchParams.set("client_id", google.clientId);
      target.searchParams.set("redirect_uri", `${this.options.issuer()}/oauth/google/callback`);
      target.searchParams.set("response_type", "code");
      target.searchParams.set("scope", "openid email");
      target.searchParams.set("prompt", "select_account");
      target.searchParams.set("state", this.encode(pending, "pending"));
      if (this.allowedDomains.length === 1) {
        target.searchParams.set("hd", this.allowedDomains[0]);
      }
      res.writeHead(302, { Location: target.toString() });
      res.end();
      return;
    }

    if (!submittedToken) {
      renderLoginPage(res, {
        clientId,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        resource,
        error: req.method === "POST" ? "Informe o token de acesso." : undefined,
      });
      return;
    }

    if (!this.matchesSharedSecret(submittedToken)) {
      renderLoginPage(res, {
        clientId,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        resource,
        error: "Token inválido.",
      });
      return;
    }

    const code = this.encode<CodePayload>(
      { clientId, redirectUri, codeChallenge, issuedAt: Date.now() },
      "code"
    );

    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    if (state) target.searchParams.set("state", state);

    res.writeHead(302, { Location: target.toString() });
    res.end();
  }

  private async googleCallback(res: ServerResponse, url: URL): Promise<void> {
    const google = this.options.googleSignIn;
    if (!google) {
      json(res, 404, { error: "not_found" });
      return;
    }

    const pending = this.decode<PendingAuthorization>(
      url.searchParams.get("state") || "",
      "pending"
    );
    if (!pending || Date.now() - pending.issuedAt > CODE_TTL_MS) {
      json(res, 400, { error: "invalid_request", error_description: "sign-in state expired" });
      return;
    }

    const googleError = url.searchParams.get("error");
    if (googleError) {
      redirectWithError(res, pending.redirectUri, pending.state, "access_denied", googleError);
      return;
    }

    const code = url.searchParams.get("code");
    if (!code) {
      redirectWithError(res, pending.redirectUri, pending.state, "invalid_request", "missing code");
      return;
    }

    let email: string;
    try {
      email = await exchangeGoogleCode(
        google,
        code,
        `${this.options.issuer()}/oauth/google/callback`
      );
    } catch (error) {
      renderDeniedPage(res, error instanceof Error ? error.message : "sign-in failed");
      return;
    }

    const domain = (email.split("@")[1] || "").toLowerCase();
    if (!this.allowedDomains.includes(domain)) {
      renderDeniedPage(
        res,
        `${email} não tem acesso. Permitido: ${this.allowedDomains
          .map((allowed) => `@${allowed}`)
          .join(", ")}.`
      );
      return;
    }

    const authorizationCode = this.encode<CodePayload>(
      {
        clientId: pending.clientId,
        redirectUri: pending.redirectUri,
        codeChallenge: pending.codeChallenge,
        issuedAt: Date.now(),
        email,
      },
      "code"
    );

    const target = new URL(pending.redirectUri);
    target.searchParams.set("code", authorizationCode);
    if (pending.state) target.searchParams.set("state", pending.state);
    res.writeHead(302, { Location: target.toString() });
    res.end();
  }

  private async token(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      json(res, 405, { error: "invalid_request" });
      return;
    }

    const params = new URLSearchParams(await readRawBody(req));
    const grantType = params.get("grant_type");

    if (grantType === "refresh_token") {
      const payload = this.decode<TokenPayload>(params.get("refresh_token") || "", "token");
      if (!payload || payload.kind !== "refresh" || payload.expiresAt <= Date.now()) {
        json(res, 400, { error: "invalid_grant" });
        return;
      }
      json(res, 200, this.issueTokens(payload.clientId, payload.email));
      return;
    }

    if (grantType !== "authorization_code") {
      json(res, 400, { error: "unsupported_grant_type" });
      return;
    }

    const payload = this.decode<CodePayload>(params.get("code") || "", "code");
    if (!payload || Date.now() - payload.issuedAt > CODE_TTL_MS) {
      json(res, 400, { error: "invalid_grant", error_description: "code expired or invalid" });
      return;
    }

    if (payload.redirectUri !== (params.get("redirect_uri") || "")) {
      json(res, 400, { error: "invalid_grant", error_description: "redirect_uri mismatch" });
      return;
    }

    const verifier = params.get("code_verifier") || "";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    if (!verifier || challenge !== payload.codeChallenge) {
      json(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
      return;
    }

    if (!this.redeemCode(params.get("code") || "")) {
      json(res, 400, { error: "invalid_grant", error_description: "code already redeemed" });
      return;
    }

    json(res, 200, this.issueTokens(payload.clientId, payload.email));
  }

  private issueTokens(clientId: string, email?: string): Record<string, unknown> {
    const now = Date.now();
    return {
      access_token: this.encode<TokenPayload>(
        { kind: "access", clientId, issuedAt: now, expiresAt: now + ACCESS_TOKEN_TTL_MS, email },
        "token"
      ),
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: this.encode<TokenPayload>(
        { kind: "refresh", clientId, issuedAt: now, expiresAt: now + REFRESH_TOKEN_TTL_MS, email },
        "token"
      ),
      scope: "mcp",
    };
  }

  private redeemCode(code: string): boolean {
    const now = Date.now();
    for (const [seen, expiresAt] of this.redeemedCodes) {
      if (expiresAt <= now) this.redeemedCodes.delete(seen);
    }

    const fingerprint = createHash("sha256").update(code).digest("base64url");
    if (this.redeemedCodes.has(fingerprint)) return false;

    this.redeemedCodes.set(fingerprint, now + CODE_TTL_MS);
    return true;
  }

  private matchesSharedSecret(candidate: string): boolean {
    const expected = this.options.sharedSecret;
    if (!candidate || !expected || candidate.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
  }

  private encode<T>(payload: T, context: string): string {
    return seal(payload, this.options.sharedSecret, context);
  }

  private decode<T>(value: string, context: string): T | null {
    return unseal<T>(value, this.options.sharedSecret, context);
  }
}

async function exchangeGoogleCode(
  google: GoogleSignInConfig,
  code: string,
  redirectUri: string
): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google rejeitou o login (${response.status}).`);
  }

  const tokens = (await response.json()) as { id_token?: string };
  if (!tokens.id_token) {
    throw new Error("Google não devolveu id_token.");
  }

  const [, payload] = tokens.id_token.split(".");
  if (!payload) throw new Error("id_token malformado.");

  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as {
    email?: string;
    email_verified?: boolean | string;
    aud?: string;
    exp?: number;
  };

  if (claims.aud !== google.clientId) throw new Error("id_token de outro client.");
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) {
    throw new Error("id_token expirado.");
  }
  if (claims.email_verified !== true && claims.email_verified !== "true") {
    throw new Error("email não verificado no Google.");
  }
  if (!claims.email) throw new Error("id_token sem email.");

  return claims.email.toLowerCase();
}

function renderDeniedPage(res: ServerResponse, message: string): void {
  res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acesso negado</title>
<style>:root{color-scheme:light dark}body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}main{max-width:420px;padding:40px;background:#1e293b;border-radius:16px}h1{margin:0 0 12px;font-size:20px}p{margin:0;color:#94a3b8;line-height:1.6;font-size:14px}</style></head>
<body><main><h1>Acesso negado</h1><p>${escapeHtml(message)}</p></main></body></html>`);
}

function isSafeRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === "https:") return true;
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function redirectWithError(
  res: ServerResponse,
  redirectUri: string,
  state: string,
  error: string,
  description: string
): void {
  try {
    const target = new URL(redirectUri);
    target.searchParams.set("error", error);
    target.searchParams.set("error_description", description);
    if (state) target.searchParams.set("state", state);
    res.writeHead(302, { Location: target.toString() });
    res.end();
  } catch {
    json(res, 400, { error, error_description: description });
  }
}

interface LoginPageParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string;
  error?: string;
}

function renderLoginPage(res: ServerResponse, params: LoginPageParams): void {
  const hidden = (
    [
      ["client_id", params.clientId],
      ["redirect_uri", params.redirectUri],
      ["state", params.state],
      ["code_challenge", params.codeChallenge],
      ["code_challenge_method", params.codeChallengeMethod],
      ["resource", params.resource],
    ] as const
  )
    .filter(([, value]) => value)
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
    .join("");

  res.writeHead(params.error ? 401 : 200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WhatsApp MCP</title>
<style>
:root{color-scheme:light dark}
body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}
main{width:100%;max-width:380px;padding:40px;background:#1e293b;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.4)}
h1{margin:0 0 8px;font-size:20px}
p{margin:0 0 24px;color:#94a3b8;line-height:1.5;font-size:14px}
label{display:block;font-size:13px;margin-bottom:8px;color:#cbd5e1}
input[type=password]{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px}
button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:8px;background:#22c55e;color:#052e16;font-size:14px;font-weight:600;cursor:pointer}
.error{color:#fca5a5;font-size:13px;margin:12px 0 0}
</style></head>
<body><main>
<h1>WhatsApp MCP</h1>
<p>Autorize este cliente informando o token de acesso do servidor.</p>
<form method="post" action="/oauth/authorize">
${hidden}
<label for="token">Token de acesso</label>
<input id="token" name="token" type="password" autocomplete="current-password" autofocus>
${params.error ? `<p class="error">${escapeHtml(params.error)}</p>` : ""}
<button type="submit">Autorizar</button>
</form>
</main></body></html>`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 64 * 1024) throw new Error("request body too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}
