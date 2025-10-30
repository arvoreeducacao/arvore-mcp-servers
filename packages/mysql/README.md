# MySQL MCP Server

A Model Context Protocol (MCP) server implementation for MySQL that enables read-only database operations through a standardized protocol for integration with LLMs and AI tools.

## Features

- ✅ **Read-only**: Executes only SELECT, SHOW, DESCRIBE and EXPLAIN queries
- 🔒 **Secure**: Validates queries to prevent write operations
- 🚀 **Fast**: Direct MySQL connection using mysql2
- 📡 **MCP Protocol**: Communication via stdio transport
- 🛠️ **TypeScript**: Fully typed with Zod validation
- 🌍 **Environment Configuration**: Easy setup via environment variables

## Installation

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=mysql-mcp&config=eyJjb21tYW5kIjoibm9kZSIsImFyZ3MiOlsiLi9kaXN0L2luZGV4LmpzIl0sImVudiI6eyJNWVNRTF9IT1NUIjoibG9jYWxob3N0IiwiTVlTUUxfUE9SVCI6IjMzMDYiLCJNWVNRTF9VU0VSIjoicm9vdCIsIk1ZU1FMX1BBU1NXT1JEIjoic2VjcmV0IiwiTVlTUUxfREFUQUJBU0UiOiJteWRiIiwiTVlTUUxfU1NMIjoiZmFsc2UiLCJNWVNRTF9DT05ORUNUSU9OX1RJTUVPVVQiOiIzMDAwMCJ9fQ%3D%3D)
```bash
# Install dependencies
pnpm install

# Build the project
pnpm build
```

## Configuration

The server is configured via environment variables:

```bash
export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_USER=root
export MYSQL_PASSWORD=secret
export MYSQL_DATABASE=mydb
export MYSQL_SSL=false
export MYSQL_CONNECTION_TIMEOUT=30000
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

Executes SELECT queries on the MySQL database.

**Parameters:**

- `query` (string): SQL SELECT statement

**Example:**

```json
{
  "query": "SELECT * FROM users LIMIT 10"
}
```

### `list_tables`

Lists all tables in the current database.

**Parameters:** None

### `describe_table`

Gets structure and schema information for a specific table.

**Parameters:**

- `tableName` (string): Name of the table

### `show_databases`

Lists all available databases on the MySQL server.

**Parameters:** None

## Programmatic Usage

```typescript
import { MySQLMCPServer } from "mysql-mcp-server";

const server = new MySQLMCPServer({
  host: "localhost",
  port: 3306,
  user: "root",
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

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mysql": {
      "command": "node",
      "args": ["/path/to/mysql-mcp/dist/index.js"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "secret",
        "MYSQL_DATABASE": "mydb",
        "MYSQL_SSL": "false"
      }
    }
  }
}
```

## Security

- **Query validation**: Only read operations are allowed
- **Parameter escaping**: Uses prepared statements when possible
- **Connection timeout**: Prevents hanging connections
- **Error handling**: MySQL errors are caught and handled appropriately

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build
pnpm build

# Linting
pnpm lint
pnpm lint:fix
```

## Architecture

- **`MySQLConnection`**: Manages MySQL connection
- **`MySQLMCPTools`**: Implements MCP tools
- **`MySQLMCPServer`**: Main MCP server with stdio transport
- **Validation**: Uses Zod for type and parameter validation

## Connection Management

The server uses a **connection-per-query** approach for optimal reliability:

- **Fresh connections**: Each query opens and closes its own connection
- **No persistent connections**: Prevents timeout and stale connection issues
- **Automatic cleanup**: Connections are always properly closed after each operation
- **Improved stability**: Eliminates bugs caused by long-running connections

## Limitations

- Read-only operations only (SELECT, SHOW, DESCRIBE, EXPLAIN)
- Connection-per-query (no connection pooling)
- MySQL only (not PostgreSQL, SQLite, etc.)
- Stdio transport only (no HTTP/WebSocket)
