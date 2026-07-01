import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createTokenVerifier, type OAuthConfig } from "./auth.js";
import type { ClientHubMCPServer } from "./server.js";

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
  const verifier = createTokenVerifier(oauthConfig);

  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  const origin = new URL(oauthConfig.resourceUrl).origin;

  const protectedResourceMetadata = {
    resource: oauthConfig.resourceUrl,
    authorization_servers: [origin],
    scopes_supported: oauthConfig.requiredScopes,
    resource_name: "Client Hub MCP",
    bearer_methods_supported: ["header"],
  };

  const authorizationServerMetadata = {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    jwks_uri: oauthConfig.jwksUri,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "client_secret_post",
      "none",
    ],
    scopes_supported: oauthConfig.requiredScopes,
  };

  const protectedResourceHandler = (_req: Request, res: Response) => {
    res.json(protectedResourceMetadata);
  };

  app.get("/.well-known/oauth-protected-resource", protectedResourceHandler);
  app.get(
    "/.well-known/oauth-protected-resource/mcp",
    protectedResourceHandler
  );

  app.get(
    "/.well-known/oauth-authorization-server",
    (_req: Request, res: Response) => {
      res.json(authorizationServerMetadata);
    }
  );

  const appendOAuthParam = (
    params: URLSearchParams,
    key: string,
    value: unknown
  ) => {
    if (typeof value === "string") {
      params.append(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          params.append(key, item);
        }
      }
    }
  };

  const allowedAuthorizeParams = new Set([
    "response_type",
    "client_id",
    "redirect_uri",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
    "nonce",
    "prompt",
    "login_hint",
  ]);

  app.get("/authorize", (req: Request, res: Response) => {
    console.error(
      `[oauth] GET /authorize query=${JSON.stringify(req.query)}`
    );
    const target = new URL(oauthConfig.authorizationEndpoint);
    for (const [key, value] of Object.entries(req.query)) {
      if (allowedAuthorizeParams.has(key)) {
        appendOAuthParam(target.searchParams, key, value);
      }
    }
    console.error(`[oauth] -> 302 ${target.toString()}`);
    res.redirect(302, target.toString());
  });

  const allowedTokenParams = new Set([
    "grant_type",
    "code",
    "client_id",
    "client_secret",
    "redirect_uri",
    "code_verifier",
  ]);

  app.post(
    "/token",
    express.urlencoded({ extended: true }),
    async (req: Request, res: Response) => {
      try {
        const receivedKeys = Object.keys(req.body ?? {});
        console.error(
          `[oauth] POST /token keys=${JSON.stringify(receivedKeys)}`
        );
        const body = new URLSearchParams();
        for (const [key, value] of Object.entries(req.body ?? {})) {
          if (allowedTokenParams.has(key)) {
            appendOAuthParam(body, key, value);
          }
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const upstream = await fetch(oauthConfig.tokenEndpoint, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
          },
          body: body.toString(),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        const text = await upstream.text();
        console.error(
          `[oauth] token upstream status=${upstream.status} body=${text.slice(0, 300)}`
        );
        res.status(upstream.status);
        res.set("Cache-Control", "no-store");
        res.set("Pragma", "no-cache");
        const contentType = upstream.headers.get("content-type");
        if (contentType) {
          res.type(contentType);
        }
        res.send(text);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res
          .status(502)
          .json({ error: "server_error", error_description: message });
      }
    }
  );

  app.post("/register", (req: Request, res: Response) => {
    console.error(
      `[oauth] POST /register body=${JSON.stringify(req.body ?? {}).slice(0, 300)}`
    );
    res.status(201).json({
      client_id: oauthConfig.clientId,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      redirect_uris: oauthConfig.redirectUris,
    });
  });

  const bearerAuth = requireBearerAuth({
    verifier,
    requiredScopes: oauthConfig.requiredScopes,
    resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
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
