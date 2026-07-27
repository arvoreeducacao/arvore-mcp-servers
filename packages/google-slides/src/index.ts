#!/usr/bin/env node

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

if (!refreshToken) {
  console.error(
    "Error: GSLIDES_MCP_REFRESH_TOKEN is required.\n" +
      "Run `google-slides-mcp auth login` locally and store the printed refresh token."
  );
  process.exit(1);
}

const transportEnv = (process.env.MCP_TRANSPORT || "stdio").toLowerCase();
const transport =
  transportEnv === "http" || transportEnv === "streamable-http" || transportEnv === "streamable_http"
    ? "http"
    : "stdio";

const authToken = process.env.MCP_AUTH_TOKEN || "";

if (transport === "http" && authToken.length < 16) {
  console.error(
    "Error: MCP_AUTH_TOKEN with at least 16 characters is required for the http transport.\n" +
      "It guards /mcp and doubles as the credential of the built-in OAuth authorization server.\n" +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(24).toString('hex'))\""
  );
  process.exit(1);
}

const signInClientId = process.env.GSLIDES_MCP_SIGNIN_CLIENT_ID;
const signInClientSecret = process.env.GSLIDES_MCP_SIGNIN_CLIENT_SECRET;
const signInDomains = (process.env.GSLIDES_MCP_SIGNIN_DOMAINS || "arvore.com.br")
  .split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);

if ((signInClientId || signInClientSecret) && !(signInClientId && signInClientSecret)) {
  console.error(
    "Error: GSLIDES_MCP_SIGNIN_CLIENT_ID and GSLIDES_MCP_SIGNIN_CLIENT_SECRET must be set together."
  );
  process.exit(1);
}

if (signInClientId && signInDomains.length === 0) {
  console.error("Error: GSLIDES_MCP_SIGNIN_DOMAINS cannot be empty when Google sign-in is enabled.");
  process.exit(1);
}

try {
  const server = new GoogleSlidesMCPServer({
    client: { clientId, clientSecret, refreshToken },
    transport,
    host: process.env.HOST || "0.0.0.0",
    port: parsePort(process.env.PORT, 8080),
    authToken,
    publicUrl: process.env.MCP_PUBLIC_URL,
    googleSignIn:
      signInClientId && signInClientSecret
        ? {
            clientId: signInClientId,
            clientSecret: signInClientSecret,
            allowedDomains: signInDomains,
          }
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
