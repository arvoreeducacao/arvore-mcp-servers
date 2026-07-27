# deploy — google-slides MCP on Dokploy

Single HTTP container exposing the MCP **streamable-http** transport at `POST /mcp`,
plus `GET /health` and the OAuth endpoints below. No persistent disk state — every
call goes straight to the Google Slides / Drive APIs.

MCP sessions live in an in-process map, so a session is bound to the instance that
created it: horizontal scaling needs sticky routing by `mcp-session-id` (or an
external session store). Run **one replica** and the question doesn't come up.
OAuth state does *not* need stickiness — client registrations, codes and tokens are
HMAC-signed with `MCP_AUTH_TOKEN` instead of stored, so they survive redeploys and
work across replicas.

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
| `MCP_AUTH_TOKEN` | **yes** | ≥16 chars. Guards `/mcp` and is the credential of the built-in OAuth server. The container **refuses to start** without it. Store as a **secret** |
| `MCP_PUBLIC_URL` | yes (http) | public origin of the deployment, e.g. `https://slides-mcp.example.com`. The OAuth issuer and the URLs in the discovery documents; a wrong value breaks the connector flow |
| `GSLIDES_MCP_SIGNIN_CLIENT_ID` | recommended | OAuth client id of a **Web application** client (the Desktop client used for the refresh token cannot do a server-side redirect). Enables Google sign-in on the consent screen |
| `GSLIDES_MCP_SIGNIN_CLIENT_SECRET` | with the above | store as a **secret** |
| `GSLIDES_MCP_SIGNIN_DOMAINS` | with sign-in | comma-separated email domains allowed to authorize a client |
| `GSLIDES_MCP_SIGNIN_SCOPES` | no | scopes requested from each user, default `presentations,drive` |
| `MCP_TRANSPORT` | no | defaults to `http` in the image |
| `HOST` / `PORT` | no | default `0.0.0.0:8080` |

The Web client needs `https://<domain>/oauth/google/callback` in **Authorized redirect URIs**.
With sign-in configured, the consent screen is "sign in with Google" and only accounts in
`GSLIDES_MCP_SIGNIN_DOMAINS` are accepted (Google itself also restricts an unpublished
client to the project's organization). Without it, the consent screen falls back to asking
for `MCP_AUTH_TOKEN`.

`/health` stays open; everything else requires a credential. The refresh token cannot
be minted on the server (that OAuth flow needs a browser) — generate it on a laptop
and paste it into Dokploy.

## 3. Three ways for a client to authenticate

| Client | How |
|---|---|
| Claude Code, curl, anything that sets headers | `Authorization: Bearer $MCP_AUTH_TOKEN` on `POST /mcp` |
| Clients that only take a URL | `POST /mcp/<MCP_AUTH_TOKEN>` — the token rides in the path. Convenient, but it lands in proxy access logs; prefer a header when the client supports one |
| claude.ai custom connectors | OAuth 2.1. Add the connector with URL `https://<domain>/mcp` and nothing else — Claude discovers the authorization server, registers itself (DCR), and the consent screen is Google sign-in restricted to the allowed domains (or, without sign-in configured, a prompt for `MCP_AUTH_TOKEN`). No Client ID to paste |

The OAuth endpoints are `/.well-known/oauth-protected-resource[/mcp]`,
`/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/authorize`
`/oauth/token` and `/oauth/google/callback` (authorization code + PKCE S256 + refresh,
per RFC 9728 / OAuth 2.1).
Registrations, codes and tokens are HMAC-signed rather than stored — rotating
`MCP_AUTH_TOKEN` invalidates every issued token and forces clients to reconnect.

**Two identities, deliberately**:

- **OAuth clients act as the person who authorized them.** Sign-in requests the user's own
  Slides/Drive scopes with `access_type=offline`; their Google refresh token is encrypted
  (AES-256-GCM, key derived from `MCP_AUTH_TOKEN`) *inside* the access/refresh token the
  server issues, so there is no credential store and one user can never touch another's Drive.
- **`MCP_AUTH_TOKEN` is the service identity.** A client presenting it acts as the account
  behind `GSLIDES_MCP_REFRESH_TOKEN` — that's how header-only clients (Claude Code, curl)
  work. Treat it as a master credential; prefer a bot Google account over a personal one.

`GSLIDES_MCP_REFRESH_TOKEN` becomes **optional** when sign-in is configured: without it the
server has no service identity and `MCP_AUTH_TOKEN` only opens the OAuth-less door for tools
to report "connect through OAuth".

Rotating `MCP_AUTH_TOKEN` re-keys the encryption, so every issued token and client
registration dies — clients re-register and re-consent automatically on the next 401.

## 4. Client config

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

On claude.ai: **Settings → Connectors → Add custom connector**, URL
`https://<your-domain>/mcp`, leave Advanced settings empty.

## 5. Local build check

```bash
cd packages/google-slides
docker build -t google-slides-mcp .
docker run --rm -p 8080:8080 \
  -e GSLIDES_MCP_CLIENT_ID=... \
  -e GSLIDES_MCP_CLIENT_SECRET=... \
  -e GSLIDES_MCP_REFRESH_TOKEN=... \
  -e MCP_AUTH_TOKEN=dev-token-at-least-16 \
  -e MCP_PUBLIC_URL=http://localhost:8080 \
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
- Rotating `MCP_AUTH_TOKEN` also invalidates every OAuth token and client
  registration — connected clients have to reconnect.
