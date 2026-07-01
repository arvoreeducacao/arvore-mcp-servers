import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { createTokenVerifier, type OAuthConfig } from "./auth.js";
import type { ClientHubMCPServer } from "./server.js";

async function fetchOAuthMetadata(config: OAuthConfig): Promise<OAuthMetadata> {
  const discoveryUrl = `${config.issuer}/api-arvore/.well-known/openid-configuration`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const res = await fetch(discoveryUrl, {
    headers: { accept: "application/json" },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    throw new Error(
      `Failed to fetch OAuth metadata from ${discoveryUrl}: ${res.status}`
    );
  }

  return (await res.json()) as OAuthMetadata;
}

export interface HttpServerOptions {
  port: number;
  host: string;
  mcpPath: string;
}

export function httpServerOptionsFromEnvironment(): HttpServerOptions {
  return {
    port: Number.parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "0.0.0.0",
    mcpPath: process.env.MCP_PATH || "/mcp",
  };
}

export async function startHttpServer(
  clientHub: ClientHubMCPServer,
  oauthConfig: OAuthConfig,
  options: HttpServerOptions
): Promise<HttpServer> {
  const oauthMetadata = await fetchOAuthMetadata(oauthConfig);
  const resourceServerUrl = new URL(oauthConfig.resourceUrl);
  const verifier = createTokenVerifier(oauthConfig);

  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.use(
    mcpAuthMetadataRouter({
      oauthMetadata,
      resourceServerUrl,
      scopesSupported: oauthConfig.requiredScopes,
      resourceName: "Client Hub MCP",
    })
  );

  const bearerAuth = requireBearerAuth({
    verifier,
    requiredScopes: oauthConfig.requiredScopes,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceServerUrl),
  });

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.all(options.mcpPath, bearerAuth, async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport && req.method === "POST" && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, transport as StreamableHTTPServerTransport);
          },
        });

        transport.onclose = () => {
          if (transport?.sessionId) {
            transports.delete(transport.sessionId);
          }
        };

        const mcpServer = clientHub.createMcpServer();
        await mcpServer.connect(transport);
      }

      if (!transport) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "No valid session" },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message },
          id: null,
        });
      }
    }
  });

  return new Promise<HttpServer>((resolve) => {
    const httpServer = app.listen(options.port, options.host, () => {
      console.error(
        `Client Hub MCP HTTP server listening on http://${options.host}:${options.port}${options.mcpPath}`
      );
      resolve(httpServer);
    });
  });
}
