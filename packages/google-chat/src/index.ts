#!/usr/bin/env node

import { GoogleChatMCPServer } from "./server.js";

const credentialsPath =
  process.env.GOOGLE_CHAT_CREDENTIALS_PATH ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS;

const credentialsJson = process.env.GOOGLE_CHAT_CREDENTIALS_JSON;
const userEmail = process.env.GOOGLE_CHAT_USER_EMAIL;
const scopes = process.env.GOOGLE_CHAT_SCOPES?.split(",").map((s) => s.trim());

if (!credentialsPath && !credentialsJson) {
  console.error(
    "Error: Set GOOGLE_CHAT_CREDENTIALS_PATH (or GOOGLE_APPLICATION_CREDENTIALS) or GOOGLE_CHAT_CREDENTIALS_JSON"
  );
  process.exit(1);
}

try {
  const server = new GoogleChatMCPServer({
    credentialsPath,
    credentialsJson,
    userEmail,
    scopes,
  });
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Google Chat MCP Server:", error);
  process.exit(1);
}

export { GoogleChatMCPServer } from "./server.js";
export { GoogleChatClient } from "./client.js";
export { GoogleChatMCPTools } from "./tools.js";
export * from "./types.js";
