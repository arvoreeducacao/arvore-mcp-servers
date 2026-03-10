#!/usr/bin/env node

import { TeammateMCPServer } from "./server.js";

const teammateId = process.env.TEAMMATE_ID;
const teammateName = process.env.TEAMMATE_NAME;
const workspacePath = process.env.WORKSPACE_PATH || process.cwd();

if (!teammateId || !teammateName) {
  console.error("Missing required env vars: TEAMMATE_ID, TEAMMATE_NAME");
  process.exit(1);
}

const server = new TeammateMCPServer(workspacePath, teammateId, teammateName);
server.setupGracefulShutdown();
server.start().catch((error) => {
  console.error("Failed to start teammate MCP server:", error);
  process.exit(1);
});
