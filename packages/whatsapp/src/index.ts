#!/usr/bin/env node

import { WhatsAppMcpServer } from "./server.js";

const HTTP_TRANSPORT_NAMES = ["http", "streamable-http", "streamable_http"];
const transportEnv = (process.env.MCP_TRANSPORT || "stdio").trim().toLowerCase();

if (transportEnv !== "stdio" && !HTTP_TRANSPORT_NAMES.includes(transportEnv)) {
  process.stderr.write(
    `Error: unknown MCP_TRANSPORT "${process.env.MCP_TRANSPORT}".\n` +
      `Supported values: stdio, ${HTTP_TRANSPORT_NAMES.join(", ")}.\n`
  );
  process.exit(1);
}

const transport = transportEnv === "stdio" ? "stdio" : "http";

const authToken = process.env.MCP_AUTH_TOKEN || "";

if (transport === "http" && authToken.length < 16) {
  process.stderr.write(
    "Error: MCP_AUTH_TOKEN with at least 16 characters is required for the http transport.\n" +
      "It guards /mcp, signs the pairing links and is the credential of the built-in OAuth server.\n" +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))"\n'
  );
  process.exit(1);
}

const signInClientId = process.env.WHATSAPP_MCP_SIGNIN_CLIENT_ID;
const signInClientSecret = process.env.WHATSAPP_MCP_SIGNIN_CLIENT_SECRET;
const signInDomains = (process.env.WHATSAPP_MCP_SIGNIN_DOMAINS || "")
  .split(",")
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);

if ((signInClientId || signInClientSecret) && !(signInClientId && signInClientSecret)) {
  process.stderr.write(
    "Error: WHATSAPP_MCP_SIGNIN_CLIENT_ID and WHATSAPP_MCP_SIGNIN_CLIENT_SECRET must be set together.\n"
  );
  process.exit(1);
}

if (signInClientId && signInDomains.length === 0) {
  process.stderr.write(
    "Error: WHATSAPP_MCP_SIGNIN_DOMAINS is required when Google sign-in is enabled.\n" +
      "List the email domains allowed to connect, e.g. WHATSAPP_MCP_SIGNIN_DOMAINS=example.com\n"
  );
  process.exit(1);
}

const publicUrl = process.env.MCP_PUBLIC_URL?.trim() || undefined;

if (publicUrl && !isAbsoluteHttpUrl(publicUrl)) {
  process.stderr.write(
    `Error: MCP_PUBLIC_URL must be an absolute http(s) URL, got "${publicUrl}".\n`
  );
  process.exit(1);
}

try {
  const server = new WhatsAppMcpServer({
    transport,
    host: process.env.HOST || "0.0.0.0",
    port: parsePort(process.env.PORT, 8080),
    authToken,
    publicUrl,
    googleSignIn:
      signInClientId && signInClientSecret
        ? {
            clientId: signInClientId,
            clientSecret: signInClientSecret,
            allowedDomains: signInDomains,
          }
        : undefined,
  });

  server.setupGracefulShutdown();
  await server.start();
} catch (error) {
  process.stderr.write(`[whatsapp-mcp] failed to start: ${error}\n`);
  process.exit(1);
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    process.stderr.write(`Error: invalid port "${value}"\n`);
    process.exit(1);
  }
  return parsed;
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export { WhatsAppMcpServer } from "./server.js";
export { WhatsAppClient } from "./whatsapp-client.js";
