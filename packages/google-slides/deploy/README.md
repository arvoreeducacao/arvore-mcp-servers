# deploy — google-slides MCP on Dokploy

Single stateless HTTP container exposing the MCP **streamable-http** transport at
`POST /mcp`, plus `GET /health`. No disk state: every call goes straight to the
Google Slides / Drive APIs, so it scales horizontally without extra work.

MCP sessions live in memory, so a client's session is bound to the instance that
created it — run **one replica**, or add sticky sessions by `mcp-session-id` if you
scale out.

## 1. Dokploy application

- Source: this repo (`arvore-mcp-servers`), build context `packages/google-slides`,
  Dockerfile `Dockerfile`.
- Port: `8080`.
- Domain: attach the public domain, let Dokploy/Traefik terminate TLS.
- Health check path: `/health`.
- Replicas: `1`.

The image builds the TypeScript in a first stage and ships only `dist` + prod deps.

## 2. Environment variables (Dokploy → Environment)

| Var | Required | Notes |
|-----|----------|-------|
| `GSLIDES_MCP_CLIENT_ID` | yes | OAuth client id (Desktop app) |
| `GSLIDES_MCP_CLIENT_SECRET` | yes | store as a **secret** |
| `GSLIDES_MCP_REFRESH_TOKEN` | yes | minted locally with `google-slides-mcp auth login` — store as a **secret** |
| `MCP_AUTH_TOKEN` | recommended | if set, `/mcp` requires `Authorization: Bearer <token>`; `/health` stays open. Store as a **secret** |
| `MCP_TRANSPORT` | no | defaults to `http` in the image |
| `HOST` / `PORT` | no | default `0.0.0.0:8080` |

Without `MCP_AUTH_TOKEN` the `/mcp` endpoint is **unauthenticated** and anyone who
reaches the domain edits Slides as the authorizing Google account. On a public domain,
always set it.

The refresh token cannot be minted on the server (the OAuth flow needs a browser).
Generate it on a laptop, paste it into Dokploy.

## 3. Client config

```jsonc
{
  "mcpServers": {
    "google-slides": {
      "url": "https://<your-domain>/mcp",
      "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" }
    }
  }
}
```

## 4. Local build check

```bash
cd packages/google-slides
docker build -t google-slides-mcp .
docker run --rm -p 8080:8080 \
  -e GSLIDES_MCP_CLIENT_ID=... \
  -e GSLIDES_MCP_CLIENT_SECRET=... \
  -e GSLIDES_MCP_REFRESH_TOKEN=... \
  -e MCP_AUTH_TOKEN=dev-token \
  google-slides-mcp

curl -s localhost:8080/health          # -> ok
```

## Notes

- Deploying replaces the container: in-flight MCP sessions die and clients must
  re-initialize. Harmless here (no long-running jobs), unlike the video-analyzer.
- Slides API quota is per Google project: 300 read + 60 write requests/min per user
  by default. `get_slide_image` costs one read plus one thumbnail download.
- Rotating the refresh token: `google-slides-mcp auth logout`, `auth login` again,
  update the Dokploy secret, redeploy.
