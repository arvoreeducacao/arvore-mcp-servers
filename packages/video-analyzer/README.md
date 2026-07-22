# @arvoretech/video-analyzer-mcp

MCP server that turns a video into **frames (images the model can see)** and a
**timestamped transcription (text)**, so an AI assistant can "watch" a video.

The model never receives raw video — this server bridges it:
`video → ffmpeg frames + ElevenLabs Scribe transcript`.

## Requirements

- Python >= 3.10
- [`ffmpeg`](https://ffmpeg.org/) + `ffprobe` on PATH (`brew install ffmpeg`)
- `yt-dlp` (installed as a dependency) for URL sources
- `ELEVENLABS_API_KEY` in the environment (for `transcribe`)

## Install

```bash
cd packages/video-analyzer
python3 -m venv .venv && . .venv/bin/activate
pip install -e .
```

## Run

```bash
ELEVENLABS_API_KEY=... arvore-video-analyzer-mcp
```

MCP client config (stdio):

```json
{
  "mcpServers": {
    "video-analyzer": {
      "command": "/abs/path/packages/video-analyzer/.venv/bin/arvore-video-analyzer-mcp",
      "env": { "ELEVENLABS_API_KEY": "..." }
    }
  }
}
```

## Tools

| Tool | Purpose |
| --- | --- |
| `load_video(source)` | Register a local path or URL; returns `video_id` + metadata. |
| `transcribe(video_id, language_code?, diarize?)` | Audio → text with timestamped segments (ElevenLabs Scribe). Cached. |
| `search_transcript(video_id, query, limit?)` | Find segments matching text, return their timestamps. |
| `get_frame_at(video_id, timestamp)` | One frame at a timestamp, as an image. |
| `get_frames_at(video_id, timestamps[])` | Up to 12 frames at given timestamps. |
| `extract_key_frames(video_id, mode, dedup?)` | Strategic overview frames. `mode`: `transcript` \| `scene` \| `interval`. |
| `contact_sheet(video_id, mode)` | One grid image of thumbnails + `index_to_seconds`, so the model picks moments then fetches them in full res. |

### Strategic frame selection

`extract_key_frames` and `contact_sheet` share the same selection engine:

- **`mode="transcript"`** (default, best for talks/tutorials/screencasts): one frame
  per spoken segment, aligned with what is being said. Needs `transcribe` first;
  falls back to scene detection otherwise.
- **`mode="scene"`**: frames on visual scene changes (`scene_threshold` 0-1).
- **`mode="interval"`**: one frame every `every_seconds`.
- **`dedup=True`** (default): perceptual-hash dedup removes near-identical frames
  (`dedup_threshold` 0-64, lower = stricter) — kills redundancy in slow slides or
  static footage.

Agentic overview flow: `contact_sheet` → model eyeballs the grid → maps chosen
indices to seconds via `index_to_seconds` → `get_frames_at` for full-res frames.

## Typical flow

1. `load_video` → get `video_id`
2. `transcribe` → read content, locate the moment (has timestamps)
3. `get_frame_at(timestamp)` → pull the exact print

## Notes

- Frames are downscaled (max 768px, JPEG) to protect the context window.
- Frame extraction is capped at 12 images per call.
- Videos are cached under a temp dir by `video_id` and GC'd after 6h.

## Cloud (Dokploy)

The server also speaks the MCP **streamable-http** transport for remote hosting.
Set `MCP_TRANSPORT=http` (default in the Docker image) and it serves `POST /mcp`
plus `GET /health` on `PORT` (default 8080). Set `MCP_AUTH_TOKEN` to require
`Authorization: Bearer <token>` on `/mcp`. See [`deploy/README.md`](./deploy/README.md).
