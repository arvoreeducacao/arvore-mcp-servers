# Client Hub MCP Server

A Model Context Protocol (MCP) server for the Árvore Client Hub. It exposes
read-only access to the unified customer database (Pipedrive CRM + WhatsApp
conversations) so LLMs and AI tools can answer business questions quickly.

## Architecture

This server does not touch ClickHouse or Qdrant directly. It calls the
`api-arvore` Client Hub endpoints over HTTP, which centralizes authentication,
authorization (employee-only), audit logging and LGPD/PII controls. The MCP
authenticates with a scoped, read-only service token.

```
Claude (skills) → client-hub-mcp (stdio) → api-arvore (guards) → ClickHouse + Qdrant
```

## Features

- **Read-only**: only fetches aggregated/searchable data, never writes.
- **Centralized auth**: all access flows through api-arvore guards and audit.
- **MCP Protocol**: communication via stdio transport.
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
