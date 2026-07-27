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

try {
  const server = new GoogleSlidesMCPServer({
    client: { clientId, clientSecret, refreshToken },
    transport,
    host: process.env.HOST || "0.0.0.0",
    port: parseInt(process.env.PORT || "8080", 10),
    authToken: process.env.MCP_AUTH_TOKEN,
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
        ? parseInt(process.env.GSLIDES_MCP_REDIRECT_PORT, 10)
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

export { GoogleSlidesMCPServer } from "./server.js";
export { GoogleSlidesClient } from "./client.js";
export { GoogleSlidesMCPTools } from "./tools.js";
export * from "./types.js";
