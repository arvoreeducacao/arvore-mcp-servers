# deploy — video-analyzer MCP on Dokploy

Runs as a single stateless HTTP container exposing the MCP **streamable-http**
transport at `POST /mcp`, plus `GET /health`.

State (downloaded videos, extracted frames, cached transcripts) lives on the
container's ephemeral filesystem under `/tmp/arvore-video-analyzer`, keyed by
`video_id` and GC'd after 6h. A client's `load_video` → `transcribe` → frame flow
must land on the **same instance**, so run **one replica** (or add a shared volume
and sticky sessions if you scale out).

## 1. Dokploy application

- Source: this repo (`arvore-mcp-servers`), build context `packages/video-analyzer`,
  Dockerfile `Dockerfile`.
- Port: `8080`.
- Domain: attach the public domain, let Dokploy/Traefik terminate TLS.
- Health check path: `/health`.
- Replicas: `1`.

The image bundles `ffmpeg` and installs `yt-dlp` as a Python dependency, so no
extra build steps are needed.

## 2. Environment variables (Dokploy → Environment)

| Var | Required | Notes |
|-----|----------|-------|
| `ELEVENLABS_API_KEY` | yes | ElevenLabs key for Scribe transcription — store as a **secret** |
| `MCP_AUTH_TOKEN` | recommended | if set, every `/mcp` request must send `Authorization: Bearer <token>`; `/health` stays open. Store as a **secret** |
| `MCP_TRANSPORT` | no | defaults to `http` in the image |
| `HOST` | no | defaults to `0.0.0.0` |
| `PORT` | no | defaults to `8080` |

Without `MCP_AUTH_TOKEN` the `/mcp` endpoint is **unauthenticated** — only acceptable
if the domain is internal/behind another auth layer. For a public domain, always set it.

## 3. Client config

Point an MCP client at the streamable-http endpoint:

```jsonc
{
  "mcpServers": {
    "video-analyzer": {
      "url": "https://video-analyzer.arvore.dev/mcp",
      "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" }
    }
  }
}
```

## 4. Local build check

```bash
cd packages/video-analyzer
docker build -t video-analyzer-mcp .
docker run --rm -p 8080:8080 \
  -e ELEVENLABS_API_KEY=... \
  -e MCP_AUTH_TOKEN=dev-token \
  video-analyzer-mcp

curl -s localhost:8080/health          # -> ok
```

## Notes / scaling

- URL sources are downloaded with `yt-dlp`; large videos consume disk and CPU while
  transcoding. Give the app enough ephemeral storage and CPU on Dokploy.
- Transcription cost is on ElevenLabs (~per-minute of audio); frame extraction is
  local CPU only.
- For horizontal scale you need a shared cache (e.g. mount a volume for
  `/tmp/arvore-video-analyzer`) plus sticky routing by `video_id`; the default
  single-replica setup avoids that entirely.
