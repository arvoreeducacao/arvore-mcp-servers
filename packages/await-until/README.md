# Await Until MCP Server

A Model Context Protocol (MCP) server that provides polling/waiting primitives. Repeatedly checks conditions (shell commands, HTTP endpoints, files, or other MCP tools) at configurable intervals until they're met or time out.

## Features

- **Command Polling**: Execute shell commands until output matches a condition
- **URL Polling**: Poll HTTP endpoints until they return expected status/body
- **File Polling**: Watch filesystem until files exist, disappear, or contain content
- **MCP Polling**: Call any other MCP server's tool and poll until the result matches — auto-discovers servers from your mcp.json (Kiro, Cursor, Claude Desktop)
- **Configurable**: Interval, timeout, and match conditions for every tool
- **MCP Protocol**: Communication via stdio transport
- **TypeScript**: Fully typed with Zod validation
- **No Configuration**: No environment variables required

## Architecture

```
Agent calls await_until_* tool
  → Await-Until MCP Server starts polling loop
    → Each iteration: execute check (command/url/file/mcp)
    → Evaluate match condition against output
    → If matched → return success
    → If not → sleep interval → retry
    → If timeout → return failure
```

For `await_until_mcp`, the server reads your IDE's `mcp.json` config, spawns the target MCP server as a child process via stdio, calls the specified tool, and evaluates the result.

## Usage

```bash
# Development
pnpm dev

# Production
pnpm build
node dist/index.js
```

## Available MCP Tools

### `await_until_command`

Repeatedly executes a shell command at a given interval until the output matches a condition or times out.

**Parameters:**

- `command` (string): Shell command to execute on each poll
- `match` (string, optional): How to evaluate output (default: `exists`)
  - `exists`: Exit code is 0
  - `contains`: stdout contains the pattern
  - `not_contains`: stdout does NOT contain the pattern
  - `equals`: stdout exactly equals the pattern (trimmed)
  - `not_equals`: stdout does NOT equal the pattern
  - `regex`: stdout matches the regex pattern
  - `not_empty`: stdout is not empty
- `pattern` (string, optional): String or regex to match. Required for `contains`, `not_contains`, `equals`, `not_equals`, `regex`
- `interval_seconds` (number, optional): Seconds between polls (default: 5, min: 1, max: 300)
- `timeout_seconds` (number, optional): Max seconds to wait (default: 120, min: 1, max: 3600)
- `cwd` (string, optional): Working directory for the command
- `shell` (string, optional): Shell to use (default: `/bin/bash`)

**Example — wait for a service to be healthy:**

```json
{
  "command": "curl -sf http://localhost:3000/health",
  "match": "contains",
  "pattern": "\"status\":\"ok\"",
  "interval_seconds": 5,
  "timeout_seconds": 60
}
```

**Example — wait for a Docker container to be running:**

```json
{
  "command": "docker inspect -f '{{.State.Running}}' my-container",
  "match": "equals",
  "pattern": "true",
  "interval_seconds": 3,
  "timeout_seconds": 30
}
```

### `await_until_url`

Polls an HTTP endpoint at a given interval until it returns the expected status code and/or body content.

**Parameters:**

- `url` (string): URL to poll
- `method` (string, optional): HTTP method — `GET`, `POST`, or `HEAD` (default: `GET`)
- `expected_status` (number, optional): Expected HTTP status code. If omitted, any 2xx is accepted
- `body_contains` (string, optional): String that the response body must contain
- `headers` (object, optional): Custom headers to send
- `interval_seconds` (number, optional): Seconds between polls (default: 5)
- `timeout_seconds` (number, optional): Max seconds to wait (default: 120)

**Example — wait for an API to be ready:**

```json
{
  "url": "http://localhost:4000/api/health",
  "expected_status": 200,
  "interval_seconds": 5,
  "timeout_seconds": 90
}
```

### `await_until_file`

Polls the filesystem at a given interval until a file exists, disappears, or contains expected content.

**Parameters:**

- `path` (string): Absolute or relative file path to watch
- `match` (string, optional): Condition to check (default: `exists`)
  - `exists`, `not_exists`, `contains`, `regex`, `not_empty`
- `pattern` (string, optional): String or regex to match. Required for `contains`, `regex`
- `interval_seconds` (number, optional): Seconds between polls (default: 3)
- `timeout_seconds` (number, optional): Max seconds to wait (default: 120)

**Example — wait for a build artifact:**

```json
{
  "path": "./dist/index.js",
  "match": "exists",
  "interval_seconds": 3,
  "timeout_seconds": 120
}
```

**Example — wait for a lock file to be removed:**

```json
{
  "path": "/tmp/migration.lock",
  "match": "not_exists",
  "interval_seconds": 5,
  "timeout_seconds": 300
}
```

### `await_until_mcp`

Polls another MCP server's tool at a given interval until the result matches a condition or times out. Reads your IDE's `mcp.json` config to discover and spawn the target MCP server, then calls the specified tool repeatedly.

**How it works:**

1. Reads `mcp.json` from your workspace or global config (auto-detects Kiro, Cursor, Claude Desktop)
2. Finds the server config by `server_name`
3. Spawns the MCP server as a child process via stdio
4. Calls `tool_name` with `tool_arguments` on each poll
5. Evaluates the text result against the `match` condition
6. Returns when matched or timed out

**Parameters:**

- `server_name` (string): Name of the MCP server as defined in your `mcp.json` (e.g. `datadog`, `slack`, `arvore-mysql`)
- `tool_name` (string): Name of the MCP tool to call on each poll (e.g. `search_logs`, `query`)
- `tool_arguments` (object, optional): Arguments to pass to the MCP tool on each call
- `match` (string, optional): How to evaluate the result (default: `not_empty`)
  - `contains`, `not_contains`, `equals`, `not_equals`, `regex`, `not_empty`
- `pattern` (string, optional): String or regex to match. Required for `contains`, `not_contains`, `equals`, `not_equals`, `regex`
- `interval_seconds` (number, optional): Seconds between polls (default: 10)
- `timeout_seconds` (number, optional): Max seconds to wait (default: 120)
- `mcp_config_path` (string, optional): Explicit path to `mcp.json`. Auto-detected if omitted

**Config auto-detection order:**

1. `mcp_config_path` (if provided)
2. `.kiro/settings/mcp.json` (workspace)
3. `.cursor/mcp.json` (workspace)
4. `.vscode/mcp.json` (workspace)
5. `~/.kiro/settings/mcp.json` (global)
6. `~/.cursor/mcp.json` (global)
7. `~/Library/Application Support/Claude/claude_desktop_config.json` (global)

**Example — wait for a database row to appear:**

```json
{
  "server_name": "arvore-mysql",
  "tool_name": "query",
  "tool_arguments": {
    "sql": "SELECT status FROM migrations WHERE name = 'add_users_table'"
  },
  "match": "contains",
  "pattern": "completed",
  "interval_seconds": 5,
  "timeout_seconds": 300
}
```

**Example — wait for a LaunchDarkly flag to be enabled:**

```json
{
  "server_name": "launchdarkly",
  "tool_name": "get_flag",
  "tool_arguments": {
    "key": "new-checkout-flow",
    "environment": "production"
  },
  "match": "contains",
  "pattern": "\"on\":true",
  "interval_seconds": 10,
  "timeout_seconds": 120
}
```

**Example — wait for a Datadog monitor to recover:**

```json
{
  "server_name": "datadog",
  "tool_name": "list_monitors",
  "tool_arguments": {
    "name": "API Latency",
    "groupStates": ["Alert"]
  },
  "match": "contains",
  "pattern": "\"overall_state\":\"OK\"",
  "interval_seconds": 30,
  "timeout_seconds": 600
}
```

## MCP Configuration

```json
{
  "mcpServers": {
    "await-until": {
      "command": "npx",
      "args": ["-y", "@arvoretech/await-until-mcp"]
    }
  }
}
```

## Development

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
```

## License

MIT
