#!/usr/bin/env node

import { SendGridMCPServer } from "./server.js";

try {
  const server = new SendGridMCPServer();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start SendGrid MCP Server:", error);
  process.exit(1);
}

export { SendGridMCPServer } from "./server.js";
export { SendGridClient } from "./sendgrid-client.js";
export { SendGridMCPTools } from "./tools.js";
export * from "./types.js";
