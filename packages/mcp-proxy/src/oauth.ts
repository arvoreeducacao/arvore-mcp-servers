import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

const DEFAULT_CALLBACK_PORT = 9321;
const DEFAULT_FLOW_TIMEOUT_MS = 5 * 60 * 1000;

interface StoredCredentials {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
}

interface PendingAuth {
  resolve: (code: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class OAuthPendingError extends Error {
  constructor(public readonly provider: string) {
    super(`OAuth authorization pending for ${provider}`);
    this.name = "OAuthPendingError";
  }
}

export class OAuthCallbackReceiver {
  private server: Server | null = null;
  private readonly pending = new Map<string, PendingAuth>();
  readonly port: number;

  constructor(port?: number) {
    this.port =
      port ??
      parseInt(
        process.env.MCP_PROXY_OAUTH_CALLBACK_PORT || String(DEFAULT_CALLBACK_PORT),
        10,
      );
  }

  get callbackUrl(): string {
    return `http://127.0.0.1:${this.port}/oauth/callback`;
  }

  start(): Promise<void> {
    if (this.server) return Promise.resolve();

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch((error) => {
        console.error("[oauth] callback handler error:", error);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("internal error");
        }
      });
    });

    return new Promise((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.port, "127.0.0.1", () => {
        console.error(`[oauth] callback receiver on ${this.callbackUrl}`);
        resolve();
      });
    });
  }

  waitForCode(provider: string, timeoutMs: number): Promise<string> {
    const existing = this.pending.get(provider);
    if (existing) {
      clearTimeout(existing.timer);
      existing.reject(new Error("superseded by a new OAuth flow"));
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(provider);
        reject(
          new Error(
            `OAuth flow timed out after ${Math.round(timeoutMs / 1000)}s waiting for browser authorization`,
          ),
        );
      }, timeoutMs);
      this.pending.set(provider, { resolve, reject, timer });
    });
  }

  private settle(provider: string, fn: (p: PendingAuth) => void): boolean {
    const entry = this.pending.get(provider);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(provider);
    fn(entry);
    return true;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", `http://127.0.0.1:${this.port}`);
    if (url.pathname !== "/oauth/callback") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }

    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const error = url.searchParams.get("error") || "";
    const errorDescription = url.searchParams.get("error_description") || "";

    const stateProvider = state.includes(":") ? state.slice(0, state.indexOf(":")) : "";
    let provider = stateProvider && this.pending.has(stateProvider) ? stateProvider : "";
    if (!provider && this.pending.size === 1) {
      provider = Array.from(this.pending.keys())[0];
    }

    if (!provider) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderCallbackPage("Nenhuma autorização pendente.", false));
      return;
    }

    if (error) {
      this.settle(provider, (p) =>
        p.reject(new Error(`OAuth denied: ${error}${errorDescription ? ` — ${errorDescription}` : ""}`)),
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderCallbackPage(`Autorização negada: ${error}`, false));
      return;
    }

    if (!code) {
      this.settle(provider, (p) => p.reject(new Error("OAuth callback sem código")));
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderCallbackPage("Callback sem código de autorização.", false));
      return;
    }

    this.settle(provider, (p) => p.resolve(code));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderCallbackPage("Autorização concluída! Você pode fechar esta aba.", true));
  }

  stop(): Promise<void> {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error("receiver stopped"));
    }
    this.pending.clear();

    if (!this.server) return Promise.resolve();
    const server = this.server;
    this.server = null;
    return new Promise((resolve) => server.close(() => resolve()));
  }
}

export interface ProxyOAuthOptions {
  name: string;
  serverUrl: string;
  scopes?: string[];
  clientName?: string;
  receiver: OAuthCallbackReceiver;
  storeDir?: string;
  onEvent?: (message: string) => void;
}

export class ProxyOAuthClientProvider implements OAuthClientProvider {
  private readonly storePath: string;
  private data: StoredCredentials;
  private lastAuthorizationUrl: string | null = null;

  constructor(private readonly options: ProxyOAuthOptions) {
    const dir =
      options.storeDir ||
      process.env.MCP_PROXY_OAUTH_STORE_DIR ||
      join(homedir(), ".mcp-proxy", "oauth");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const key = createHash("sha256").update(options.serverUrl).digest("hex").slice(0, 24);
    this.storePath = join(dir, `${key}.json`);
    this.data = this.load();
  }

  get redirectUrl(): string {
    return this.options.receiver.callbackUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: this.options.clientName || "mcp-proxy",
      ...(this.options.scopes?.length ? { scope: this.options.scopes.join(" ") } : {}),
    };
  }

  state(): string {
    return `${this.options.name}:${randomBytes(8).toString("hex")}`;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.data.clientInformation;
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    this.data.clientInformation = info;
    this.persist();
  }

  tokens(): OAuthTokens | undefined {
    return this.data.tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.data.tokens = tokens;
    this.persist();
    this.emit("OAuth tokens saved");
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.data.codeVerifier = codeVerifier;
    this.persist();
  }

  codeVerifier(): string {
    if (!this.data.codeVerifier) {
      throw new Error("No PKCE code verifier stored");
    }
    return this.data.codeVerifier;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.lastAuthorizationUrl = authorizationUrl.toString();
    this.emit(`OAuth authorization required: ${this.lastAuthorizationUrl}`);
  }

  get authorizationUrl(): string | null {
    return this.lastAuthorizationUrl;
  }

  openAuthorizationUrl(): void {
    if (this.lastAuthorizationUrl) {
      openBrowser(this.lastAuthorizationUrl);
    }
  }

  waitForCode(timeoutMs?: number): Promise<string> {
    const timeout =
      timeoutMs ??
      parseInt(process.env.MCP_PROXY_OAUTH_TIMEOUT_MS || String(DEFAULT_FLOW_TIMEOUT_MS), 10);
    return this.options.receiver.waitForCode(this.options.name, timeout);
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier"): void {
    if (scope === "all" || scope === "client") this.data.clientInformation = undefined;
    if (scope === "all" || scope === "tokens") this.data.tokens = undefined;
    if (scope === "all" || scope === "verifier") this.data.codeVerifier = undefined;
    this.persist();
  }

  hasTokens(): boolean {
    return !!this.data.tokens?.access_token;
  }

  private load(): StoredCredentials {
    if (!existsSync(this.storePath)) return {};
    try {
      return JSON.parse(readFileSync(this.storePath, "utf-8")) as StoredCredentials;
    } catch {
      return {};
    }
  }

  private persist(): void {
    writeFileSync(this.storePath, JSON.stringify(this.data, null, 2), { mode: 0o600 });
  }

  private emit(message: string): void {
    this.options.onEvent?.(message);
  }
}

function openBrowser(url: string): void {
  try {
    if (process.platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true });
      child.on("error", () => {});
      child.unref();
      return;
    }
    const cmd = process.platform === "darwin" ? "open" : "xdg-open";
    const child = spawn(cmd, [url], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // browser opening is best-effort; the URL is always logged
  }
}

function renderCallbackPage(message: string, success: boolean): string {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>mcp-proxy</title>
<style>:root{color-scheme:light dark}body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}main{max-width:420px;padding:40px;background:#1e293b;border-radius:16px;text-align:center}p{margin:0;line-height:1.6;font-size:15px}</style></head>
<body><main><p>${success ? "✅ " : "⚠️ "}${escaped}</p></main></body></html>`;
}
