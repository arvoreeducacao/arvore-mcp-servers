#!/usr/bin/env node

import { resolve } from "node:path";
import { KanbanMCPServer } from "./server.js";

const kanbanPath = resolve(
  process.env.KANBAN_PATH || process.cwd(),
  process.env.KANBAN_PATH ? "" : "kanban"
);
const embeddingModel = process.env.KANBAN_EMBEDDING_MODEL;
const defaultReleaseStatus = process.env.KANBAN_DEFAULT_RELEASE_STATUS || "review";

const enableUi = process.env.KANBAN_UI === "true";
const uiPort = parseInt(process.env.KANBAN_PORT || "4799", 10);

try {
  const server = new KanbanMCPServer(kanbanPath, embeddingModel, defaultReleaseStatus);
  server.setupGracefulShutdown();
  await server.start();

  if (enableUi) {
    const { startHttpServer } = await import("./http.js");
    startHttpServer(server.getStore(), uiPort);
  }
} catch (error) {
  console.error("Failed to start Kanban MCP Server:", error);
  process.exit(1);
}

export { KanbanMCPServer } from "./server.js";
export { KanbanStore } from "./store.js";
export { EmbeddingEngine } from "./embeddings.js";
export { KanbanMCPTools } from "./tools.js";
export * from "./types.js";
