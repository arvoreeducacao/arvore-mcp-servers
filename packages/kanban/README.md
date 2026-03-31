# @arvoretech/kanban-mcp

Persistent kanban boards for AI agents — manage tasks across sessions with multi-agent coordination, semantic search, and a Linear-style web UI.

## Features

- 12 MCP tools for board and card management
- Multi-session: claim/release cards with session tracking across parallel chats
- Semantic search via LanceDB with multilingual embeddings
- Subtasks via `parent_card_id`
- Optional web UI (Linear-style dark theme with drag-and-drop)
- JSON persistence with atomic writes
- Re-read from disk for multi-process visibility

## Quick Start

```bash
npx @arvoretech/kanban-mcp
```

### With web UI

```bash
KANBAN_UI=true npx @arvoretech/kanban-mcp
# Open http://localhost:4799
```

## Configuration

```json
{
  "mcpServers": {
    "kanban": {
      "command": "npx",
      "args": ["-y", "@arvoretech/kanban-mcp"],
      "env": {
        "KANBAN_PATH": "./kanban",
        "KANBAN_UI": "true",
        "KANBAN_PORT": "4799"
      }
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `KANBAN_PATH` | `./kanban` | Data directory |
| `KANBAN_EMBEDDING_MODEL` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | Embedding model |
| `KANBAN_DEFAULT_RELEASE_STATUS` | `review` | Default status on release |
| `KANBAN_UI` | `false` | Enable web UI |
| `KANBAN_PORT` | `4799` | Web UI port |

## MCP Tools

| Tool | Description |
|---|---|
| `list_boards` | List all boards with card counts and active sessions |
| `create_board` | Create a board with default or custom columns |
| `get_board` | Get board with all cards, columns, and session info |
| `get_card` | Get card details with subtasks and session log |
| `create_card` | Create a card in a column |
| `update_card` | Update card properties |
| `move_card` | Move a card to another column |
| `claim_card` | Claim a card for your session |
| `release_card` | Release a card with a status |
| `search_cards` | Semantic search across cards |
| `archive_card` | Soft-delete a card |
| `delete_card` | Permanently remove a card |
