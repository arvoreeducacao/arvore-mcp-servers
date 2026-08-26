#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { PlayConsoleMCPServer } from "./server.js";
import { ServiceAccountKey } from "./types.js";

function loadServiceAccount(): ServiceAccountKey {
  const raw = process.env.PLAY_CONSOLE_SERVICE_ACCOUNT_JSON;
  const file =
    process.env.PLAY_CONSOLE_SERVICE_ACCOUNT_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const source = raw || (file ? readFileSync(file, "utf8") : undefined);
  if (!source) {
    console.error(
      "Error: set PLAY_CONSOLE_SERVICE_ACCOUNT_JSON (raw key JSON) or PLAY_CONSOLE_SERVICE_ACCOUNT_FILE (path to the key file).\n" +
        "The service account must be invited in Play Console > Users and permissions with 'View app information' on each app."
    );
    process.exit(1);
  }
  const parsed = JSON.parse(source) as Partial<ServiceAccountKey>;
  if (!parsed.client_email || !parsed.private_key) {
    console.error("Error: the service account key is missing client_email or private_key.");
    process.exit(1);
  }
  return parsed as ServiceAccountKey;
}

const packages = (process.env.PLAY_CONSOLE_PACKAGES || "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

try {
  const server = new PlayConsoleMCPServer({ serviceAccount: loadServiceAccount(), packages });
  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  console.error("Failed to start Play Console MCP Server:", error);
  process.exit(1);
}
