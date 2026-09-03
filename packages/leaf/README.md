# @arvoretech/leaf-mcp

> **Aviso: só para desenvolvimento local, contra um banco de dev.** Este pacote
> roda via stdio e fala **direto com o MySQL** usando a senha do banco, sem
> identidade nem controle de acesso por pessoa. Nunca aponte para o banco de
> produção. O caminho recomendado é o **MCP remoto do próprio Leaf**, em
> `${BETTER_AUTH_URL}/api/mcp` (na Árvore, `https://leaf.arvore.com.br/api/mcp`):
> OAuth 2.1 com login e consentimento no Leaf, e cada tool rodando com a ACL da
> pessoa que autorizou. Veja a seção "MCP" do README do repositório `leaf`.

MCP server for [Leaf](https://github.com/arvoreeducacao/leaf), Arvore's collaborative document editor: search and read documents as markdown, browse Notion-style databases, organizations and comment threads — plus a small, fenced write surface (create pages, append/replace markdown, manage the organization invite link).

## Tools

| Tool | Description |
| --- | --- |
| `search_documents` | Full-text search over titles and bodies (falls back to title matching) |
| `get_document` | One document: metadata, content rendered as markdown, children, row values |
| `list_documents` | Pages and databases, optionally filtered by organization or owner email |
| `list_organizations` | Organizations with members (email, role) and teamspaces |
| `get_database` | A Leaf database: typed properties, views and rows with resolved option names |
| `list_comments` | Comment threads of a document, with replies, anchors and resolved state |
| `create_document` | Create a page from markdown, owned by a Leaf user (subpage inherits org/teamspace) |
| `update_document` | Append to or replace a page's body, with a version snapshot first |
| `manage_invite_link` | Get, enable, reset or disable an organization's invite link |

## Write semantics

Writes are deliberately fenced:

- `update_document` **refuses to write when the document was updated in the last seconds** — a live realtime session reseeds the database every ~3s and would silently overwrite a direct write. It also uses an optimistic `updated_at` guard, and always records a `document_versions` snapshot before changing anything.
- Only pages are editable — databases, rows and comments are read-only here.
- Nothing is ever hard-deleted, no organization/teamspace membership is changed (the invite link is the one exception, by design), and no public document link can be created.

This write path goes straight to MySQL and is an interim step: when Leaf ships its authenticated HTTP API (see the "API e MCP do Leaf" RFC), these tools should switch to calling it, inheriting per-user permissions.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `LEAF_DATABASE_URL` | yes | MySQL URL of the Leaf database, e.g. `mysql://user:password@host:3306/leaf` |
| `LEAF_BASE_URL` | no | Base URL used in returned links (default `https://leaf.arvore.com.br`) |
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
