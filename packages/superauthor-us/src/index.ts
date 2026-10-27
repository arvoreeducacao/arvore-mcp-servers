#!/usr/bin/env node

import { Database } from "./database.js";
import { SuperAuthorUSServer } from "./server.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Error: ${name} is required.`);
    process.exit(1);
  }
  return value;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    console.error(`Error: invalid port "${value}"`);
    process.exit(1);
  }
  return parsed;
}

function parseList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

const signingKey = required("MCP_TOKEN_SIGNING_KEY");
if (signingKey.length < 32) {
  console.error("Error: MCP_TOKEN_SIGNING_KEY must have at least 32 characters.");
  process.exit(1);
}

const opsToken = process.env.MCP_OPS_TOKEN?.trim() || "";
if (opsToken && (opsToken.length < 24 || opsToken === signingKey)) {
  console.error("Error: MCP_OPS_TOKEN must have at least 24 characters and differ from MCP_TOKEN_SIGNING_KEY.");
  process.exit(1);
}

const allowedEmails = new Set(parseList(process.env.SUPERAUTHOR_US_ALLOWED_EMAILS));
if (allowedEmails.size === 0) {
  console.error("Error: SUPERAUTHOR_US_ALLOWED_EMAILS must list at least one email.");
  process.exit(1);
}

const db = new Database({
  host: required("MYSQL_HOST"),
  port: parsePort(process.env.MYSQL_PORT, 3306),
  user: required("MYSQL_USER"),
  password: required("MYSQL_PASSWORD"),
  database: required("MYSQL_DATABASE"),
});

try {
  const server = new SuperAuthorUSServer({
    db,
    host: process.env.HOST || "0.0.0.0",
    port: parsePort(process.env.PORT, 8080),
    opsToken,
    signingKey,
    publicUrl: process.env.MCP_PUBLIC_URL,
    googleSignIn: {
      clientId: required("GOOGLE_CLIENT_ID"),
      clientSecret: required("GOOGLE_CLIENT_SECRET"),
    },
    allowedEmails: () => allowedEmails,
    allowedRedirectHosts: parseList(process.env.MCP_OAUTH_ALLOWED_REDIRECT_HOSTS),
  });

  server.setupGracefulShutdown(() => db.close());
  await server.start();
} catch (error) {
  console.error("Failed to start Super Author US MCP:", error);
  process.exit(1);
}
