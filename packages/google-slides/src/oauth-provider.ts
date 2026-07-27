import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { IncomingMessage, ServerResponse } from "node:http";

const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface OAuthProviderOptions {
  sharedSecret: string;
  issuer: () => string;
}

interface ClientRecord {
  redirectUris: string[];
  issuedAt: number;
}

interface CodePayload {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  issuedAt: number;
}

interface TokenPayload {
  kind: "access" | "refresh";
  clientId: string;
  issuedAt: number;
  expiresAt: number;
}

export class OAuthProvider {
  constructor(private options: OAuthProviderOptions) {}

  handles(pathname: string): boolean {
    return (
      pathname.startsWith("/.well-known/oauth-protected-resource") ||
      pathname.startsWith("/.well-known/oauth-authorization-server") ||
      pathname === "/oauth/register" ||
      pathname === "/oauth/authorize" ||
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
    const clientId = this.encode(record, "client");

    json(res, 201, {
      client_id: clientId,
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
      req.method === "POST"
        ? new URLSearchParams(await readRawBody(req))
        : url.searchParams;

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

    const submittedToken = params.get("token") || "";
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
      json(res, 200, this.issueTokens(payload.clientId));
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

    json(res, 200, this.issueTokens(payload.clientId));
  }

  private issueTokens(clientId: string): Record<string, unknown> {
    const now = Date.now();
    return {
      access_token: this.encode<TokenPayload>(
        { kind: "access", clientId, issuedAt: now, expiresAt: now + ACCESS_TOKEN_TTL_MS },
        "token"
      ),
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: this.encode<TokenPayload>(
        { kind: "refresh", clientId, issuedAt: now, expiresAt: now + REFRESH_TOKEN_TTL_MS },
        "token"
      ),
      scope: "mcp",
    };
  }

  private matchesSharedSecret(candidate: string): boolean {
    const expected = this.options.sharedSecret;
    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
  }

  private encode<T>(payload: T, context: string): string {
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${data}.${this.sign(data, context)}`;
  }

  private decode<T>(value: string, context: string): T | null {
    const [data, signature] = value.split(".");
    if (!data || !signature) return null;

    const expected = this.sign(data, context);
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null;
    }

    try {
      return JSON.parse(Buffer.from(data, "base64url").toString("utf-8")) as T;
    } catch {
      return null;
    }
  }

  private sign(data: string, context: string): string {
    return createHmac("sha256", `${this.options.sharedSecret}:${context}`)
      .update(data)
      .digest("base64url");
  }
}

export function generateToken(): string {
  return randomBytes(24).toString("hex");
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
<title>Google Slides MCP</title>
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
<h1>Google Slides MCP</h1>
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
