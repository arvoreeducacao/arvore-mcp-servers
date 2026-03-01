# @arvoretech/mcp-proxy

MCP Proxy Gateway that reduces token usage by connecting N upstream MCP servers and exposing only 2 tools: `mcp_search` and `mcp_call`.

Instead of loading dozens of tool definitions into the agent's context, the proxy consolidates everything behind a semantic search interface.

## How It Works

```
Agent (Kiro / Claude / Cursor)
  └─ mcp-proxy (2 tools)
       ├─ mysql (4 tools)
       ├─ postgresql (5 tools)
       ├─ slack (6 tools)
       ├─ datadog (7 tools)
       └─ ... N more
```

The agent sees only:
- `mcp_search` — find tools by natural language query (semantic + lexical hybrid search)
- `mcp_call` — execute a tool with normalized, token-efficient output

## Features

- Semantic search using multilingual embeddings (`paraphrase-multilingual-MiniLM-L12-v2`)
- Hybrid ranking: BM25-like lexical (0.4) + cosine similarity (0.6)
- Output shaping: strips redundant fields, truncates text, replaces IDs with short refs
- Cursor-based pagination with 5-minute TTL
- Detail mode for full output when needed
- Supports stdio and HTTP transports
- Environment variable expansion (`${VAR}`) in upstream configs

## Configuration

### Environment Variables

```bash
# Required: JSON array of upstream server configs
MCP_PROXY_UPSTREAMS='[
  {
    "name": "mysql",
    "command": "npx",
    "args": ["-y", "@arvoretech/mysql-mcp"],
    "env": { "MYSQL_HOST": "localhost", "MYSQL_DATABASE": "mydb" }
  },
  {
    "name": "remote-api",
    "transport": "http",
    "url": "https://mcp.example.com/mcp",
    "auth": { "apiKey": "MY_API_TOKEN_ENV_VAR" }
  }
]'

# Optional tuning
MCP_PROXY_SEARCH_LIMIT=8         # Max search results (default: 8)
MCP_PROXY_CALL_ITEM_LIMIT=20     # Max items per call response (default: 20)
MCP_PROXY_MAX_TEXT_LENGTH=500     # Max chars per text field (default: 500)
MCP_PROXY_MAX_OUTPUT_TOKENS=8000  # Max output tokens (default: 8000)
```

### Transport Types

**stdio** (default): Launches a child process.

```json
{ "name": "mysql", "command": "npx", "args": ["-y", "@arvoretech/mysql-mcp"], "env": { "MYSQL_HOST": "localhost" } }
```

**http**: Connects to a remote server (StreamableHTTP → SSE fallback). Optional Bearer token via `auth.apiKey` (resolved from env).

```json
{ "name": "remote", "transport": "http", "url": "https://mcp.example.com/mcp", "auth": { "apiKey": "REMOTE_TOKEN" } }
```

### Kiro / VS Code Config (mcp.json)

```json
{
  "mcpServers": {
    "mcp-proxy": {
      "command": "node",
      "args": ["/path/to/packages/mcp-proxy/dist/index.js"],
      "env": {
        "MYSQL_HOST": "${MYSQL_HOST}",
        "MCP_PROXY_UPSTREAMS": "[{\"name\":\"mysql\",\"command\":\"npx\",\"args\":[\"-y\",\"@arvoretech/mysql-mcp\"],\"env\":{\"MYSQL_HOST\":\"${MYSQL_HOST}\"}}]"
      }
    }
  }
}
```

> Env vars referenced as `${VAR}` inside `MCP_PROXY_UPSTREAMS` are expanded from the proxy's own environment at startup. Pass them through in the outer `env` block.

## Interface

### mcp_search

```json
// Input
{ "query": "list database tables", "limit": 5 }

// Output
{
  "results": [
    { "ref": "t:mysql.list_tables", "title": "List Tables", "hint": "List all tables in the current database", "example": {} }
  ]
}
```

### mcp_call

```json
// Input
{ "ref": "t:mysql.read_query", "args": { "query": "SELECT * FROM users LIMIT 5" } }

// Output — shaped (default)
{
  "items": [{ "ref": "mys_1", "name": "John", "email": "john@example.com" }],
  "next_cursor": null
}

// Input — with detail mode (all fields preserved)
{ "ref": "t:mysql.read_query", "args": { "query": "..." }, "detail": true }

// Input — pagination
{ "ref": "t:mysql.read_query", "page_cursor": "c:mysql.read_query:p2" }
```

## Architecture

| Module | Role |
|--------|------|
| `connector.ts` | Connects to N upstreams via stdio or HTTP, ingests tools |
| `registry.ts` | Stores tool metadata with pre-computed embeddings |
| `search.ts` | Hybrid search: lexical (BM25) + semantic (cosine similarity) |
| `embeddings.ts` | Local embeddings via `@xenova/transformers` |
| `output-shaper.ts` | Strips fields, truncates text, assigns short refs |
| `pagination.ts` | Cursor-based pagination with TTL |
| `logger.ts` | Audit log with timing and output size |

## Development

```bash
pnpm build   # Compile TypeScript
pnpm dev     # Run with tsx (hot reload)
pnpm test    # Run tests
```
