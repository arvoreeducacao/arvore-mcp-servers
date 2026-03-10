#!/usr/bin/env node

import { AgentTeamsChatServer } from "./server.js";

const DEFAULT_TEMPLATE = "🤖 *{{identity}}'s Agent* — {{message}}";

const botToken = process.env.SLACK_BOT_TOKEN;
const channel = process.env.SLACK_CHANNEL;
const agentIdentity = process.env.AGENT_IDENTITY;
const messageTemplate = process.env.MESSAGE_TEMPLATE || DEFAULT_TEMPLATE;

if (!botToken) {
  console.error("Error: SLACK_BOT_TOKEN is required");
  process.exit(1);
}

if (!channel) {
  console.error("Error: SLACK_CHANNEL is required");
  process.exit(1);
}

if (!agentIdentity) {
  console.error("Error: AGENT_IDENTITY is required (e.g. your name)");
  process.exit(1);
}

try {
  const server = new AgentTeamsChatServer({
    botToken,
    channel,
    agentIdentity,
    messageTemplate,
  });
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Agent Teams Chat MCP Server:", error);
  process.exit(1);
}

export { AgentTeamsChatServer } from "./server.js";
export { SlackClient } from "./slack-client.js";
export { AgentTeamsChatTools } from "./tools.js";
export { renderTemplate } from "./template.js";
export * from "./types.js";
