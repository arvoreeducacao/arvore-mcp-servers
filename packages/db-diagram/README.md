# @arvoretech/db-diagram-mcp

MCP Server that generates Mermaid ER diagrams from SQL DDL.

## Tools

| Tool | Description |
|------|-------------|
| `generate_erd` | Full ER diagram from DDL. Optionally filter to specific tables. |
| `generate_domain_map` | BFS from an entry table, showing all related tables within N hops. |
| `explain_table` | Column details, incoming/outgoing FKs, and a mini neighborhood diagram. |
| `trace_flow` | Find relationship paths between two tables with a connecting diagram. |

## Usage

All tools accept DDL as input (no database connection required).

```json
{
  "ddl": "CREATE TABLE users (...); CREATE TABLE posts (...);",
  "tables": ["users", "posts"],
  "title": "User Domain"
}
```

## Output

All diagram output is Mermaid syntax, ready to render in GitHub, Notion, or any Mermaid-compatible viewer.

## Running

```bash
# stdio transport (for MCP clients)
npx @arvoretech/db-diagram-mcp

# or via pnpm in this monorepo
pnpm --filter @arvoretech/db-diagram-mcp dev
```

## Composable Pattern

This MCP doesn't connect to databases directly. Feed it DDL from your existing database MCPs:

1. Use `mysql-mcp` or `postgresql-mcp` to get schema (`SHOW CREATE TABLE` or `pg_dump --schema-only`)
2. Pass the DDL output to `generate_erd` or other tools
3. Get Mermaid diagrams back
