#!/usr/bin/env node

import { AWSSecretsManagerMCPServer } from "./server.js";

async function main(): Promise<void> {
  try {
    const server = AWSSecretsManagerMCPServer.fromEnvironment();
    server.setupGracefulShutdown();
    await server.start();
  } catch (error) {
    console.error("Failed to start AWS Secrets Manager MCP Server:", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { AWSSecretsManagerMCPServer } from "./server.js";
export { SecretsManagerClientWrapper } from "./secrets-manager.js";
export { AWSSecretsManagerMCPTools } from "./tools.js";
export * from "./types.js";


