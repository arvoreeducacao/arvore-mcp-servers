#!/usr/bin/env node

import { GmailMCPServer } from "./server.js";
import { TokenStore } from "./token-store.js";
import {
  DEFAULT_SCOPES,
  revokeRefreshToken,
  runAuthorizationFlow,
} from "./oauth.js";

const subcommand = process.argv[2];

if (subcommand === "auth") {
  await runAuthCommand(process.argv.slice(3));
  process.exit(0);
}

const clientId = process.env.GMAIL_MCP_CLIENT_ID;
const clientSecret = process.env.GMAIL_MCP_CLIENT_SECRET;
const refreshToken = process.env.GMAIL_MCP_REFRESH_TOKEN;
const configDir = process.env.GMAIL_MCP_CONFIG_DIR;
const allowSend =
  process.env.GMAIL_MCP_ALLOW_SEND === "true" ||
  process.env.GMAIL_MCP_ALLOW_SEND === "1";

if (!clientId || !clientSecret) {
  console.error(
    "Error: GMAIL_MCP_CLIENT_ID and GMAIL_MCP_CLIENT_SECRET are required.\n" +
      "Create an OAuth Desktop client in https://console.cloud.google.com/apis/credentials\n" +
      "then run `gmail-mcp auth login` to authorize."
  );
  process.exit(1);
}

try {
  const server = new GmailMCPServer({
    client: {
      clientId,
      clientSecret,
      refreshToken,
      configDir,
    },
    allowSend,
  });

  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Gmail MCP Server:", error);
  process.exit(1);
}

async function runAuthCommand(args: string[]): Promise<void> {
  const action = args[0] || "login";
  const store = new TokenStore(process.env.GMAIL_MCP_CONFIG_DIR);

  if (action === "login") {
    const clientId = process.env.GMAIL_MCP_CLIENT_ID;
    const clientSecret = process.env.GMAIL_MCP_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error(
        "Error: GMAIL_MCP_CLIENT_ID and GMAIL_MCP_CLIENT_SECRET must be set before `auth login`."
      );
      process.exit(1);
    }

    const port = process.env.GMAIL_MCP_REDIRECT_PORT
      ? parseInt(process.env.GMAIL_MCP_REDIRECT_PORT, 10)
      : undefined;
    const loginHint = process.env.GMAIL_MCP_LOGIN_HINT;

    console.error("Starting Gmail OAuth authorization flow...");
    console.error(`Requested scopes:\n  ${DEFAULT_SCOPES.join("\n  ")}\n`);

    const credentials = await runAuthorizationFlow({
      clientId,
      clientSecret,
      port,
      loginHint,
      scopes: DEFAULT_SCOPES,
    });

    await store.save(credentials);
    console.error("\nCredentials saved successfully.");
    console.error(
      `Refresh token captured. Access token expires in ${Math.round(
        (credentials.expires_at - Date.now()) / 1000 / 60
      )} minutes (auto-refreshed).`
    );
    return;
  }

  if (action === "logout") {
    const credentials = await store.load();
    if (!credentials) {
      console.error("No credentials found.");
      return;
    }
    try {
      await revokeRefreshToken(credentials.refresh_token);
    } catch (error) {
      console.error(
        `Token revoke warning: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
    await store.clear();
    console.error("Credentials revoked and cleared.");
    return;
  }

  if (action === "status") {
    const credentials = await store.load();
    if (!credentials) {
      console.error("Status: not logged in");
      process.exit(1);
    }
    const expiresInSec = Math.max(
      0,
      Math.round((credentials.expires_at - Date.now()) / 1000)
    );
    console.error(
      JSON.stringify(
        {
          status: "logged_in",
          scope: credentials.scope,
          token_type: credentials.token_type,
          access_token_expires_in_seconds: expiresInSec,
        },
        null,
        2
      )
    );
    return;
  }

  console.error(
    `Unknown auth subcommand: ${action}\nUsage: gmail-mcp auth <login|logout|status>`
  );
  process.exit(1);
}

export { GmailMCPServer } from "./server.js";
export { GmailClient } from "./client.js";
export { GmailMCPTools } from "./tools.js";
export { TokenStore } from "./token-store.js";
export * from "./types.js";
