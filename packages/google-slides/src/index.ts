#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { GoogleSlidesMCPServer } from "./server.js";
import { DEFAULT_SCOPES, revokeRefreshToken, runAuthorizationFlow } from "./oauth.js";

const subcommand = process.argv[2];

if (subcommand === "auth") {
  await runAuthCommand(process.argv.slice(3));
  process.exit(0);
}

const clientId = process.env.GSLIDES_MCP_CLIENT_ID || process.env.GDRIVE_MCP_CLIENT_ID;
const clientSecret =
  process.env.GSLIDES_MCP_CLIENT_SECRET || process.env.GDRIVE_MCP_CLIENT_SECRET;
const refreshToken = process.env.GSLIDES_MCP_REFRESH_TOKEN;

if (!clientId || !clientSecret) {
  console.error(
    "Error: GSLIDES_MCP_CLIENT_ID and GSLIDES_MCP_CLIENT_SECRET are required.\n" +
      "Create an OAuth Desktop client at https://console.cloud.google.com/apis/credentials,\n" +
      "enable the Google Slides API, then run `google-slides-mcp auth login`."
  );
  process.exit(1);
}

const hasSignIn = !!(
  process.env.GSLIDES_MCP_SIGNIN_CLIENT_ID && process.env.GSLIDES_MCP_SIGNIN_CLIENT_SECRET
);

if (!refreshToken && !hasSignIn) {
  console.error(
    "Error: GSLIDES_MCP_REFRESH_TOKEN is required unless Google sign-in is configured.\n" +
      "Run `google-slides-mcp auth login` locally and store the printed refresh token,\n" +
      "or set GSLIDES_MCP_SIGNIN_CLIENT_ID/SECRET so each user connects with their own account."
  );
  process.exit(1);
}

const transportEnv = (process.env.MCP_TRANSPORT || "stdio").toLowerCase();
const transport =
  transportEnv === "http" || transportEnv === "streamable-http" || transportEnv === "streamable_http"
    ? "http"
    : "stdio";

const authToken = process.env.MCP_AUTH_TOKEN || "";
let signingKey = process.env.MCP_TOKEN_SIGNING_KEY?.trim() || "";

if (transport === "http" && authToken.length < 16) {
  console.error(
    "Error: MCP_AUTH_TOKEN with at least 16 characters is required for the http transport.\n" +
      "It guards /mcp and doubles as the credential of the built-in OAuth authorization server.\n" +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(24).toString('hex'))\""
  );
  process.exit(1);
}

if (transport === "http") {
  if (signingKey && signingKey.length < 32) {
    process.stderr.write("Error: MCP_TOKEN_SIGNING_KEY must have at least 32 characters.\n");
    process.exit(1);
  }
  if (signingKey && signingKey === authToken) {
    process.stderr.write(
      "Error: MCP_TOKEN_SIGNING_KEY must differ from MCP_AUTH_TOKEN.\n" +
        "Sharing them lets anyone holding the bearer forge tokens for any identity.\n"
    );
    process.exit(1);
  }
  if (!signingKey) {
    signingKey = randomBytes(32).toString("hex");
    process.stderr.write(
      "[google-slides-mcp] MCP_TOKEN_SIGNING_KEY is not set — generated an ephemeral one.\n" +
        "Every restart invalidates the issued tokens and everyone signs in again.\n"
    );
  }
}

const allowedRedirectHosts = (process.env.MCP_OAUTH_ALLOWED_REDIRECT_HOSTS || "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);


const signInClientId = process.env.GSLIDES_MCP_SIGNIN_CLIENT_ID;
const signInClientSecret = process.env.GSLIDES_MCP_SIGNIN_CLIENT_SECRET;
const signInDomains = (process.env.GSLIDES_MCP_SIGNIN_DOMAINS || "")
  .split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);
const signInScopes = (process.env.GSLIDES_MCP_SIGNIN_SCOPES || DEFAULT_SCOPES.join(","))
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

if ((signInClientId || signInClientSecret) && !(signInClientId && signInClientSecret)) {
  console.error(
    "Error: GSLIDES_MCP_SIGNIN_CLIENT_ID and GSLIDES_MCP_SIGNIN_CLIENT_SECRET must be set together."
  );
  process.exit(1);
}

if (signInClientId && signInDomains.length === 0) {
  console.error(
    "Error: GSLIDES_MCP_SIGNIN_DOMAINS is required when Google sign-in is enabled.\n" +
      "List the email domains allowed to authorize a client, e.g. GSLIDES_MCP_SIGNIN_DOMAINS=example.com"
  );
  process.exit(1);
}

try {
  const server = new GoogleSlidesMCPServer({
    client: refreshToken ? { clientId, clientSecret, refreshToken } : null,
    transport,
    host: process.env.HOST || "0.0.0.0",
    port: parsePort(process.env.PORT, 8080),
    authToken,
    signingKey,
    allowedRedirectHosts,
    publicUrl: process.env.MCP_PUBLIC_URL,
    googleSignIn:
      signInClientId && signInClientSecret
        ? {
            clientId: signInClientId,
            clientSecret: signInClientSecret,
            allowedDomains: signInDomains,
            scopes: signInScopes,
          }
        : undefined,
    signInCredentials:
      signInClientId && signInClientSecret
        ? { clientId: signInClientId, clientSecret: signInClientSecret }
        : undefined,
  });

  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Google Slides MCP Server:", error);
  process.exit(1);
}

async function runAuthCommand(args: string[]): Promise<void> {
  const action = args[0] || "login";
  const authClientId =
    process.env.GSLIDES_MCP_CLIENT_ID || process.env.GDRIVE_MCP_CLIENT_ID;
  const authClientSecret =
    process.env.GSLIDES_MCP_CLIENT_SECRET || process.env.GDRIVE_MCP_CLIENT_SECRET;

  if (action === "login") {
    if (!authClientId || !authClientSecret) {
      console.error(
        "Error: GSLIDES_MCP_CLIENT_ID and GSLIDES_MCP_CLIENT_SECRET must be set before `auth login`."
      );
      process.exit(1);
    }

    console.error(`Requested scopes:\n  ${DEFAULT_SCOPES.join("\n  ")}`);

    const credentials = await runAuthorizationFlow({
      clientId: authClientId,
      clientSecret: authClientSecret,
      port: process.env.GSLIDES_MCP_REDIRECT_PORT
        ? parsePort(process.env.GSLIDES_MCP_REDIRECT_PORT, 0)
        : undefined,
      loginHint: process.env.GSLIDES_MCP_LOGIN_HINT,
    });

    console.error("\nAuthorized. Store this as GSLIDES_MCP_REFRESH_TOKEN:\n");
    console.log(credentials.refresh_token);
    console.error(`\nGranted scopes: ${credentials.scope}`);
    return;
  }

  if (action === "logout") {
    const token = process.env.GSLIDES_MCP_REFRESH_TOKEN;
    if (!token) {
      console.error("Nothing to revoke: GSLIDES_MCP_REFRESH_TOKEN is not set.");
      process.exit(1);
    }
    await revokeRefreshToken(token);
    console.error("Refresh token revoked. Remove it from your env/secret store.");
    return;
  }

  console.error(
    `Unknown auth subcommand: ${action}\nUsage: google-slides-mcp auth <login|logout>`
  );
  process.exit(1);
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    console.error(`Error: invalid port "${value}"`);
    process.exit(1);
  }
  return parsed;
}
