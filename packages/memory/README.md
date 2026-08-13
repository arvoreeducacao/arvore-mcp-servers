# @arvoretech/memory-mcp

MCP server for the **shared memory of Árvore** — a persistent knowledge base with semantic search, reachable as a local stdio server or as a remote connector with Google sign-in.

## What is shared memory?

It captures knowledge the team accumulates over time: architectural decisions, conventions, incident learnings, domain knowledge and gotchas. Unlike skills (prescriptive patterns), memories are descriptive facts the team has learned and keeps paying for when someone forgets them.

Everything written here is read by everyone. There is one base, not one per person.

## Tools

Two tools, both polymorphic.

### `read_memories`

| Arguments | What it does |
|-----------|--------------|
| _none_ | Returns the index: every active memory grouped by category, with title, date, author, tags and snippet |
| `query` | Semantic search by meaning, in Portuguese or English |
| `id` | Opens one memory in full. Unknown id answers with `didYouMean` suggestions |

Filters that combine with any of the above: `category`, `tags`, `author`, `status`, `limit`.

### `write_memory`

| Arguments | What it does |
|-----------|--------------|
| `title` + `category` + `content` | Creates a memory. Refuses near-duplicates unless `force: true` |
| `id` + fields to change | Updates that memory in place and stamps `updated` |
| `action: "archive"` + `id` | Retires it from active reads, keeps the history |
| `action: "delete"` + `id` | Removes it for good |

The author is never taken from the arguments: over HTTP it is the Google account that signed in, over stdio it is `MEMORY_AUTHOR`.

## Memory categories

- **decisions** — Architectural Decision Records (ADRs)
- **conventions** — team coding standards and preferences
- **incidents** — past bugs, outages and their root causes
- **domain** — business domain knowledge and glossary
- **gotchas** — known issues, quirks and workarounds

## Memory file format

```markdown
---
title: Use PostgreSQL for all services
category: decisions
date: 2024-06-01
updated: 2024-09-12
author: joao.barros@arvore.com.br
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

The id is derived from the date and the title (`2024-06-01-use-postgresql-for-all-services`). Two memories with the same title on the same day get a numeric suffix instead of overwriting each other.

## Semantic search

Uses `@xenova/transformers` with `paraphrase-multilingual-MiniLM-L12-v2` for local embeddings, stored in **LanceDB** (embedded, in `<memories>/.lancedb/`). Cosine similarity with metadata filtering, plus a staleness penalty for memories older than 180 days. Falls back to keyword search if the model fails to load.

The Docker image bakes the model in at build time, so the container boots without reaching out to HuggingFace.

## Transports

### stdio (local workspace)

Default. Resolves `MEMORY_PATH` against the workspace root and keeps `.kiro/.cursor/.opencode` steering indexes in sync.

```yaml
mcps:
  - name: team-memory
    package: "@arvoretech/memory-mcp"
    env:
      MEMORY_PATH: ./memories
```

### http (remote connector)

`MCP_TRANSPORT=http` serves Streamable HTTP at `/mcp` and brings its own OAuth 2.1 authorization server — dynamic client registration, PKCE S256, tokens sealed with HMAC (no storage, so they survive a redeploy). That is what claude.ai requires from a connector.

The consent screen is a Google sign-in restricted to the domains in `MEMORY_MCP_SIGNIN_DOMAINS`. The signed-in email becomes the `author` of everything that person writes.

A static `MCP_AUTH_TOKEN` bearer also authorizes `/mcp` for service clients, but carries no identity — memories written with it have no author.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORY_PATH` | `./memories` (stdio) / `/data/memories` (http) | Where the markdown files and the vector index live |
| `MEMORY_EMBEDDING_MODEL` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | HuggingFace model for embeddings |
| `MEMORY_AUTHOR` | — | Author recorded on stdio writes |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `MCP_AUTH_TOKEN` | — | Required on http (≥16 chars). Guards `/mcp` and signs the OAuth tokens |
| `MCP_PUBLIC_URL` | — | Public https URL of the server. The OAuth issuer is derived from it |
| `HOST` / `PORT` | `0.0.0.0` / `8080` | http bind |
| `MEMORY_MCP_SIGNIN_CLIENT_ID` | — | Google OAuth **Web** client id |
| `MEMORY_MCP_SIGNIN_CLIENT_SECRET` | — | Google OAuth client secret |
| `MEMORY_MCP_SIGNIN_DOMAINS` | — | Comma-separated email domains allowed to sign in |

Google sign-in requires `https://<domain>/oauth/google/callback` in the client's authorized redirect URIs, or the flow dies in `redirect_uri_mismatch`.

## Docker

```bash
docker build -t memory-mcp packages/memory
docker run -p 8080:8080 -v memory-data:/data \
  -e MCP_AUTH_TOKEN=... -e MCP_PUBLIC_URL=https://memory.arvore.dev \
  memory-mcp
```

The `/data` volume is mandatory: it holds every memory and the vector index. Run a single replica — the index lives in the process.

## Development

```bash
pnpm install
pnpm dev          # Run with tsx
pnpm build        # Compile TypeScript
pnpm test         # Run tests
pnpm test:cov     # Run tests with coverage
```
