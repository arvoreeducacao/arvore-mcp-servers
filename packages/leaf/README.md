# @arvoretech/leaf-mcp

MCP server for read-only access to [Leaf](https://github.com/arvoreeducacao/leaf), Arvore's collaborative document editor: search and read documents as markdown, browse Notion-style databases, organizations and comment threads.

## Tools

| Tool | Description |
| --- | --- |
| `search_documents` | Full-text search over titles and bodies (falls back to title matching) |
| `get_document` | One document: metadata, content rendered as markdown, children, row values |
| `list_documents` | Pages and databases, optionally filtered by organization or owner email |
| `list_organizations` | Organizations with members (email, role) and teamspaces |
| `get_database` | A Leaf database: typed properties, views and rows with resolved option names |
| `list_comments` | Comment threads of a document, with replies, anchors and resolved state |

All tools are read-only — the server never writes to the database.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `LEAF_DATABASE_URL` | yes | MySQL URL of the Leaf database, e.g. `mysql://user:password@host:3306/leaf` |
| `LEAF_CONNECTION_TIMEOUT` | no | Connection timeout in ms (default `30000`) |

## Usage

```json
{
  "mcpServers": {
    "leaf": {
      "command": "npx",
      "args": ["-y", "@arvoretech/leaf-mcp"],
      "env": {
        "LEAF_DATABASE_URL": "mysql://user:password@host:3306/leaf"
      }
    }
  }
}
```

## Development

```bash
pnpm install
pnpm dev      # run from source
pnpm test     # vitest
pnpm build    # compile to dist/
```
