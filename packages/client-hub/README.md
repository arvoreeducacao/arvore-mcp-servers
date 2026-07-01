# Client Hub MCP Server

A Model Context Protocol (MCP) server for the Árvore Client Hub. It exposes
read-only access to the unified customer database (Pipedrive CRM + WhatsApp
conversations) so LLMs and AI tools can answer business questions quickly.

## Architecture

This server does not touch ClickHouse or Qdrant directly. It calls the
`api-arvore` Client Hub endpoints over HTTP, which centralizes authentication,
authorization (employee-only), audit logging and LGPD/PII controls.

The server runs in two transport modes:

- **stdio** (default): local usage, authenticates with a scoped service token.
- **http**: remote connector for Claude, authenticates each user via OAuth
  (the identity server at `auth.arvore.com.br`) and forwards the user's own
  access token to api-arvore, so `@EmployeeOnly` guards and audit logging see
  the real person.

```
Claude (stdio)  → client-hub-mcp (stdio) → api-arvore (service token) → ClickHouse + Qdrant
Claude (remote) → client-hub-mcp (http)  → api-arvore (user token)    → ClickHouse + Qdrant
                       ↑ OAuth (auth.arvore.com.br)
```

## Features

- **Read-only**: only fetches aggregated/searchable data, never writes.
- **Centralized auth**: all access flows through api-arvore guards and audit.
- **MCP Protocol**: stdio transport (local) and Streamable HTTP (remote).
- **OAuth 2.0**: HTTP mode validates user access tokens against the identity
  JWKS and advertises OAuth Protected Resource Metadata for Claude.
- **TypeScript**: fully typed with Zod validation.
- **Environment Configuration**: easy setup via environment variables.

## Installation

This package is published privately to **GitHub Packages**, not the public npm
registry. Authenticate first with a GitHub token that has `read:packages` scope
and point the `@arvoretech` scope to GitHub Packages:

```bash
# ~/.npmrc
@arvoretech:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
npm install -g @arvoreeducacao/client-hub-mcp
```

## Configuration

```bash
export CLIENT_HUB_API_URL=https://livros.arvore.com.br/api-arvore
export CLIENT_HUB_API_TOKEN=<read-only service token>
export CLIENT_HUB_REQUEST_TIMEOUT=30000
```

> **Security**: `CLIENT_HUB_API_TOKEN` is a personal, short-lived credential —
> every request goes through the api-arvore guards (`@Auth`, `@AdminOnly`,
> `@EmployeeOnly`, `@TotpAuth`), so the data is never exposed without an
> authenticated employee/admin session. Do not share or commit the token, and
> rotate it if leaked. The package itself carries no secrets.

## Tools

| Tool | Description |
|---|---|
| `search_client` | Search clients by name. Returns id, name, type, city, state. |
| `get_client_360` | Aggregated 360 view: deal status/stage, students count, payment, closer, WhatsApp activity. |
| `list_client_links` | External source links (Pipedrive, WhatsApp) bound to a client. |
| `search_conversations` | Semantic search over a client's WhatsApp conversations. |

## Usage

```bash
client-hub-mcp
```

Register in Claude Desktop `mcpServers`:

```json
{
  "mcpServers": {
    "client-hub": {
      "command": "client-hub-mcp",
      "env": {
        "CLIENT_HUB_API_URL": "https://livros.arvore.com.br/api-arvore",
        "CLIENT_HUB_API_TOKEN": "<token>"
      }
    }
  }
}
```

## HTTP mode (remote connector for Claude)

Set `MCP_TRANSPORT=http` to expose the server over Streamable HTTP with OAuth.
In this mode there is no service token: each request must carry a user access
token issued by the identity server, which is validated against the JWKS and
forwarded to api-arvore.

```bash
export MCP_TRANSPORT=http
export PORT=3000
export HOST=0.0.0.0
export MCP_PATH=/mcp
export CLIENT_HUB_API_URL=https://livros.arvore.com.br/api-arvore
export OAUTH_ISSUER=https://auth.arvore.com.br
export OAUTH_JWKS_URI=https://auth.arvore.com.br/api-arvore/oauth2/jwks
export OAUTH_RESOURCE_URL=https://client-hub-mcp.arvore.dev/mcp
```

| Variable | Default | Description |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | `http` enables the remote connector. |
| `PORT` | `3000` | HTTP port. |
| `HOST` | `0.0.0.0` | Bind address. |
| `MCP_PATH` | `/mcp` | Path the MCP endpoint is served on. |
| `OAUTH_ISSUER` | `https://auth.arvore.com.br` | Identity issuer. |
| `OAUTH_JWKS_URI` | `<issuer>/api-arvore/oauth2/jwks` | JWKS used to verify tokens. |
| `OAUTH_AUDIENCE` | _(unset)_ | Optional expected token audience. |
| `OAUTH_RESOURCE_URL` | `https://client-hub-mcp.arvore.dev/mcp` | Public URL of this resource, advertised in metadata. |
| `OAUTH_REQUIRED_SCOPES` | _(none)_ | Comma-separated scopes required on the token. |

Endpoints exposed in HTTP mode:

- `GET /health` — liveness probe.
- `GET /.well-known/oauth-protected-resource/mcp` — OAuth Protected Resource
  Metadata pointing Claude to the identity authorization server.
- `ALL /mcp` — the MCP endpoint, protected by bearer auth. Unauthenticated
  requests get `401` with a `WWW-Authenticate` header carrying the metadata URL.

### Deploy (Dokploy)

Built from `packages/client-hub/Dockerfile` with the **monorepo root as the
Docker context** (the Dockerfile copies the workspace `pnpm-lock.yaml`). In the
Dokploy application set the Dockerfile path to `packages/client-hub/Dockerfile`
and the context/build path to the repository root, then configure the env vars
above plus a public domain matching `OAUTH_RESOURCE_URL`.
