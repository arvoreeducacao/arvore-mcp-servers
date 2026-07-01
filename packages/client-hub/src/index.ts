#!/usr/bin/env node

import { oauthConfigFromEnvironment } from "./auth.js";
import {
  httpServerOptionsFromEnvironment,
  startHttpServer,
} from "./http-server.js";
import { ClientHubMCPServer } from "./server.js";

const transport = process.env.MCP_TRANSPORT || "stdio";

try {
  const server = ClientHubMCPServer.fromEnvironment();
  server.setupGracefulShutdown();

  if (transport === "http") {
    const oauthConfig = oauthConfigFromEnvironment();
    const httpOptions = httpServerOptionsFromEnvironment();
    await startHttpServer(server, oauthConfig, httpOptions);
  } else {
    await server.start();
  }
} catch (error) {
  console.error("Failed to start Client Hub MCP Server:", error);
  if (error instanceof Error && error.stack) {
    console.error("Stack trace:", error.stack);
  }
  process.exit(1);
}

export { ClientHubMCPServer } from "./server.js";
export { ClientHubApiClient } from "./api-client.js";
export { ClientHubMCPTools } from "./tools.js";
export * from "./types.js";
