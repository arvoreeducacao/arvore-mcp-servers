import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  GmailMCPError,
  OAuthClientConfig,
  OAuthCredentials,
  TokenResponse,
} from "./types.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
];

export interface AuthorizeOptions extends OAuthClientConfig {
  scopes?: string[];
  port?: number;
  loginHint?: string;
  openBrowser?: (url: string) => void;
}

export async function runAuthorizationFlow(
  options: AuthorizeOptions
): Promise<OAuthCredentials> {
  const scopes = options.scopes || DEFAULT_SCOPES;
  const state = randomBytes(16).toString("hex");

  const { code, port } = await waitForCallback({
    expectedState: state,
    requestedPort: options.port,
    onReady: (resolvedPort) => {
      const redirectUri = `http://localhost:${resolvedPort}/callback`;
      const authUrl = buildAuthUrl({
        clientId: options.clientId,
        redirectUri,
        scopes,
        state,
        loginHint: options.loginHint,
      });

      console.error(`\nOpen this URL in your browser to authorize:\n\n  ${authUrl}\n`);

      if (options.openBrowser) {
        options.openBrowser(authUrl);
      } else {
        openBrowser(authUrl);
      }
    },
  });

  const redirectUri = `http://localhost:${port}/callback`;
  return exchangeCodeForToken({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    code,
    redirectUri,
  });
}

export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  loginHint?: string;
}): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", params.state);
  if (params.loginHint) {
    url.searchParams.set("login_hint", params.loginHint);
  }
  return url.toString();
}

interface CallbackResult {
  code: string;
  port: number;
}

async function waitForCallback(opts: {
  expectedState: string;
  requestedPort?: number;
  onReady: (port: number) => void;
}): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (!req.url) {
        respondError(res, "Missing URL");
        return;
      }

      const url = new URL(req.url, `http://localhost`);
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (error) {
        respondError(res, `Authorization failed: ${error}`);
        server.close();
        reject(new GmailMCPError(`OAuth error: ${error}`, "AUTH_ERROR"));
        return;
      }

      if (state !== opts.expectedState) {
        respondError(res, "Invalid state parameter");
        server.close();
        reject(
          new GmailMCPError("OAuth state mismatch — aborting", "AUTH_ERROR")
        );
        return;
      }

      if (!code) {
        respondError(res, "Missing authorization code");
        server.close();
        reject(new GmailMCPError("Missing OAuth code", "AUTH_ERROR"));
        return;
      }

      respondSuccess(res);
      const address = server.address();
      const port =
        typeof address === "object" && address ? address.port : 0;
      server.close();
      resolve({ code, port });
    });

    server.on("error", (err) => reject(err));

    const port = opts.requestedPort || 0;
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const resolvedPort =
        typeof address === "object" && address ? address.port : 0;
      opts.onReady(resolvedPort);
    });
  });
}

function respondSuccess(res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`
<!DOCTYPE html>
<html><head><title>Authorization complete</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}main{max-width:480px;padding:48px;background:#1e293b;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.4)}h1{margin:0 0 16px;font-size:24px}p{margin:0;color:#94a3b8;line-height:1.6}</style></head>
<body><main><h1>Authorization complete</h1><p>You can close this tab and return to your terminal. The MCP server has saved your credentials securely.</p></main></body></html>
  `);
}

function respondError(res: ServerResponse, message: string): void {
  res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const command =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];

  try {
    spawn(command, args, { stdio: "ignore", detached: true }).unref();
  } catch (error) {
    console.error(
      `Failed to open browser automatically: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }
}

export async function exchangeCodeForToken(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<OAuthCredentials> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new GmailMCPError(
      `Token exchange failed: ${response.status} ${error}`,
      "AUTH_ERROR",
      response.status
    );
  }

  const tokens = (await response.json()) as TokenResponse;
  if (!tokens.refresh_token) {
    throw new GmailMCPError(
      "No refresh_token returned. Run `gmail-mcp auth logout` to revoke and try again.",
      "AUTH_ERROR"
    );
  }

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope,
    token_type: tokens.token_type,
  };
}

export async function refreshAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{
  access_token: string;
  expires_at: number;
  scope: string;
  token_type: string;
}> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new GmailMCPError(
      `Token refresh failed: ${response.status} ${error}`,
      "AUTH_ERROR",
      response.status
    );
  }

  const tokens = (await response.json()) as TokenResponse;
  return {
    access_token: tokens.access_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope,
    token_type: tokens.token_type,
  };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const response = await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
  });

  if (!response.ok && response.status !== 400) {
    const error = await response.text();
    throw new GmailMCPError(
      `Token revoke failed: ${response.status} ${error}`,
      "AUTH_ERROR",
      response.status
    );
  }
}
