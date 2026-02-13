#!/usr/bin/env node

import { TempMailMCPServer } from "./server.js";

const args = process.argv.slice(2);

if (args[0] === "ui") {
  const portIdx = args.indexOf("--port");
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 3847;
  const noOpen = args.includes("--no-open");

  const { WebUIServer } = await import("./web-ui.js");
  const ui = new WebUIServer({ port: isNaN(port) ? 3847 : port, open: !noOpen });

  process.on("SIGINT", () => {
    ui.stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    ui.stop();
    process.exit(0);
  });

  await ui.start();
} else {
  try {
    const server = new TempMailMCPServer();
    server.setupGracefulShutdown();
    await server.start();
  } catch (error) {
    console.error("Failed to start TempMail MCP Server:", error);
    process.exit(1);
  }
}

export { TempMailMCPServer } from "./server.js";
export { D1DatabaseClient } from "./d1-client.js";
export { TempMailMCPTools } from "./tools.js";
export { WebUIServer } from "./web-ui.js";
export * from "./types.js";
