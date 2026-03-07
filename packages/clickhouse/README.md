# ClickHouse MCP Server

A Model Context Protocol (MCP) server implementation for ClickHouse that enables read-only database operations through a standardized protocol for integration with LLMs and AI tools.

## Why not the official ClickHouse MCP?

The official ClickHouse MCP server requires OAuth re-authentication frequently, which breaks long agent sessions. Complex or heavy queries often hit timeout limits and fail silently. This server connects directly via `@clickhouse/client` with static credentials, so there's no auth interruption and you get full control over request timeouts.

## Features

- **Read-only**: Executes only SELECT, SHOW, DESCRIBE, EXPLAIN and WITH (CTE) queries
- **Secure**: Validates queries to prevent write operations
- **No OAuth**: Direct connection with static credentials — no re-authentication needed
- **Configurable timeout**: Handles complex/heavy queries without premature timeouts
- **Fast**: Direct ClickHouse connection using @clickhouse/client
- **MCP Protocol**: Communication via stdio transport
- **TypeScript**: Fully typed with Zod validation
- **Environment Configuration**: Easy setup via environment variables

## Installation

```bash
npm install -g @arvoretech/clickhouse-mcp
```

## Configuration

The server is configured via environment variables:

```bash
export CLICKHOUSE_URL=http://localhost:8123
export CLICKHOUSE_USER=default
export CLICKHOUSE_PASSWORD=secret
export CLICKHOUSE_DATABASE=default
export CLICKHOUSE_REQUEST_TIMEOUT=30000
```

## Usage

```bash
# Development
pnpm dev

# Production
node dist/index.js
```

## Available MCP Tools

### `read_query`

Executes read-only SQL queries on the ClickHouse database.

**Parameters:**

- `query` (string): SQL SELECT statement

### `list_tables`

Lists all tables in the specified database.

**Parameters:**

- `database` (string, optional): Database name (defaults to configured database)

### `describe_table`

Gets column structure of a specific table including types, keys, and defaults.

**Parameters:**

- `tableName` (string): Name of the table
- `database` (string, optional): Database name

### `list_databases`

Lists all available databases on the ClickHouse server.

**Parameters:** None

## Programmatic Usage

```typescript
import { ClickHouseMCPServer } from "@arvoretech/clickhouse-mcp";

const server = new ClickHouseMCPServer({
  url: "https://your-host:8443",
  username: "default",
  password: "secret",
  database: "default",
  requestTimeout: 30000,
});

server.setupGracefulShutdown();
await server.start();
```

## Claude Desktop Integration

```json
{
  "mcpServers": {
    "clickhouse": {
      "command": "npx",
      "args": ["-y", "@arvoretech/clickhouse-mcp"],
      "env": {
        "CLICKHOUSE_URL": "https://your-host:8443",
        "CLICKHOUSE_USER": "default",
        "CLICKHOUSE_PASSWORD": "secret",
        "CLICKHOUSE_DATABASE": "default"
      }
    }
  }
}
```

## Development

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint
```

## Limitations

- Read-only operations only (SELECT, SHOW, DESCRIBE, EXPLAIN, WITH)
- ClickHouse only
- Stdio transport only (no HTTP/WebSocket)
