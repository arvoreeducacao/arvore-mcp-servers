#!/usr/bin/env node

import { SlackAdvancedMCPServer } from "./server.js";

try {
  const server = new SlackAdvancedMCPServer();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Slack Advanced MCP Server:", error);
  process.exit(1);
}

export { SlackAdvancedMCPServer } from "./server.js";
export { SlackClient } from "./slack-client.js";
export { ElevenLabsSTTClient } from "./elevenlabs-client.js";
export * from "./types.js";
