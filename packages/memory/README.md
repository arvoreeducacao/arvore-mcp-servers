# @arvoretech/memory-mcp

MCP server for **team memory** — a persistent knowledge base with semantic search for AI-assisted development.

## What is Team Memory?

Team memory captures accumulated knowledge over time: architectural decisions, coding conventions, incident learnings, domain knowledge, and gotchas. Unlike skills (which are prescriptive patterns), memories are descriptive facts the team has learned.

## Tools

| Tool | Description |
|------|-------------|
| `search_memories` | Semantic search across all memories |
| `get_memory` | Get full content of a specific memory |
| `add_memory` | Create a new memory entry |
| `list_memories` | List memories with optional filters |
| `archive_memory` | Soft-delete a memory |
| `remove_memory` | Permanently delete a memory |

## Memory Categories

- **decisions** — Architectural Decision Records (ADRs)
- **conventions** — Team coding standards and preferences
- **incidents** — Past bugs, outages, and their root causes
- **domain** — Business domain knowledge and glossary
- **gotchas** — Known issues, quirks, and workarounds

## Memory File Format

```markdown
---
title: Use PostgreSQL for all services
category: decisions
date: 2024-06-01
author: joao.barros
tags: [database, architecture]
status: active
---

## Context
We needed to choose between PostgreSQL and MongoDB.

## Decision
PostgreSQL, because we need ACID transactions and complex joins.

## Consequences
- Migrations managed by Ecto and Prisma
- No dynamic schema flexibility
```

## Semantic Search

Uses `@xenova/transformers` with the `paraphrase-multilingual-MiniLM-L12-v2` model for local embeddings, stored in **LanceDB** (an embedded vector database in `memories/.lancedb/`). Supports Portuguese and English queries with cosine similarity search and metadata filtering.

Falls back to keyword search if the embedding model fails to load.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORY_PATH` | `./memories` | Path to the memories directory |
| `MEMORY_EMBEDDING_MODEL` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | HuggingFace model for embeddings |

## Usage with hub.yaml

```yaml
mcps:
  - name: team-memory
    package: "@arvoretech/memory-mcp"
    env:
      MEMORY_PATH: ./memories
```

## Development

```bash
pnpm install
pnpm dev          # Run with tsx
pnpm build        # Compile TypeScript
pnpm test         # Run tests
pnpm test:cov     # Run tests with coverage
```
