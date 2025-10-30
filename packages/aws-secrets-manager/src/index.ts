#!/usr/bin/env node

import { AWSSecretsManagerMCPServer } from "./server.js";

try {
  const server = AWSSecretsManagerMCPServer.fromEnvironment();
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start AWS Secrets Manager MCP Server:", error);
  process.exit(1);
}

export { AWSSecretsManagerMCPServer } from "./server.js";
export { SecretsManagerClientWrapper } from "./secrets-manager.js";
export { AWSSecretsManagerMCPTools } from "./tools.js";
export * from "./types.js";
