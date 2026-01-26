# PostgreSQL MCP Server

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=postgresql-mcp&registry=https://npm.pkg.github.com&packageName=@arvoretech/postgresql-mcp)

A Model Context Protocol (MCP) server implementation for PostgreSQL that enables read-only database operations through a standardized protocol for integration with LLMs and AI tools.

## Features

- ✅ **Read-only**: Executes only SELECT, SHOW, EXPLAIN and WITH (CTE) queries
- 🔒 **Secure**: Validates queries to prevent write operations
- 🚀 **Fast**: Direct PostgreSQL connection using node-postgres (pg)
- 📡 **MCP Protocol**: Communication via stdio transport
- 🛠️ **TypeScript**: Fully typed with Zod validation
- 🌍 **Environment Configuration**: Easy setup via environment variables
- 📁 **Schema Support**: Full support for PostgreSQL schemas

## Installation

```bash
npm install -g @arvoretech/postgresql-mcp --registry=https://npm.pkg.github.com
```

Or configure your `.npmrc`:

```bash
echo "@arvoretech:registry=https://npm.pkg.github.com" >> ~/.npmrc
npm install -g @arvoretech/postgresql-mcp
```

## Configuration

The server is configured via environment variables:

```bash
export POSTGRESQL_HOST=localhost
export POSTGRESQL_PORT=5432
export POSTGRESQL_USER=postgres
export POSTGRESQL_PASSWORD=secret
export POSTGRESQL_DATABASE=mydb
export POSTGRESQL_SSL=false
export POSTGRESQL_CONNECTION_TIMEOUT=30000
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

Executes SELECT queries on the PostgreSQL database.

**Parameters:**

- `query` (string): SQL SELECT statement

**Example:**

```json
{
  "query": "SELECT * FROM users LIMIT 10"
}
```

### `list_tables`

Lists all tables in the specified schema.

**Parameters:**

- `schemaName` (string, optional): Schema name (default: "public")

**Example:**

```json
{
  "schemaName": "public"
}
```

### `describe_table`

Gets structure and schema information for a specific table.

**Parameters:**

- `tableName` (string): Name of the table
- `schemaName` (string, optional): Schema name (default: "public")

**Example:**

```json
{
  "tableName": "users",
  "schemaName": "public"
}
```

### `list_databases`

Lists all available databases on the PostgreSQL server.

**Parameters:** None

### `list_schemas`

Lists all schemas in the current database.

**Parameters:** None

## Programmatic Usage

```typescript
import { PostgreSQLMCPServer } from "@arvoretech/postgresql-mcp";

const server = new PostgreSQLMCPServer({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "secret",
  database: "mydb",
  ssl: false,
  connectionTimeout: 30000,
});

// Setup graceful shutdown
server.setupGracefulShutdown();

// Start server
await server.start();
```

## Claude Desktop Integration

Add to your Claude Desktop configuration file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "postgresql": {
      "command": "npx",
      "args": ["-y", "@arvoretech/postgresql-mcp"],
      "env": {
        "POSTGRESQL_HOST": "localhost",
        "POSTGRESQL_PORT": "5432",
        "POSTGRESQL_USER": "postgres",
        "POSTGRESQL_PASSWORD": "secret",
        "POSTGRESQL_DATABASE": "mydb",
        "POSTGRESQL_SSL": "false",
        "POSTGRESQL_CONNECTION_TIMEOUT": "30000"
      }
    }
  }
}
```

## Cursor IDE Integration

Add to your Cursor settings (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "postgresql": {
      "command": "npx",
      "args": ["-y", "@arvoretech/postgresql-mcp"],
      "env": {
        "POSTGRESQL_HOST": "localhost",
        "POSTGRESQL_PORT": "5432",
        "POSTGRESQL_USER": "postgres",
        "POSTGRESQL_PASSWORD": "secret",
        "POSTGRESQL_DATABASE": "mydb",
        "POSTGRESQL_SSL": "false",
        "POSTGRESQL_CONNECTION_TIMEOUT": "30000"
      }
    }
  }
}
```

## Security

- **Query validation**: Only read operations are allowed
- **SSL support**: Secure connections with SSL/TLS
- **Connection timeout**: Prevents hanging connections
- **Error handling**: PostgreSQL errors are caught and handled appropriately

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build
pnpm build

# Run tests
pnpm test

# Run tests with coverage
pnpm test:cov

# Linting
pnpm lint
pnpm lint:fix
```

## Architecture

- **`PostgreSQLConnection`**: Manages PostgreSQL connection
- **`PostgreSQLMCPTools`**: Implements MCP tools
- **`PostgreSQLMCPServer`**: Main MCP server with stdio transport
- **Validation**: Uses Zod for type and parameter validation

## Connection Management

The server uses a **connection-per-query** approach for optimal reliability:

- **Fresh connections**: Each query opens and closes its own connection
- **No persistent connections**: Prevents timeout and stale connection issues
- **Automatic cleanup**: Connections are always properly closed after each operation
- **Improved stability**: Eliminates bugs caused by long-running connections

## Limitations

- Read-only operations only (SELECT, SHOW, EXPLAIN, WITH)
- Connection-per-query (no connection pooling)
- PostgreSQL only (not MySQL, SQLite, etc.)
- Stdio transport only (no HTTP/WebSocket)
