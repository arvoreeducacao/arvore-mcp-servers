from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP, Image

from . import frames as frameutil
from . import media, transcription
from .store import VideoEntry, VideoStore

mcp = FastMCP("arvore-video-analyzer")
store = VideoStore()

MAX_FRAMES_PER_CALL = 12


@mcp.tool()
def load_video(source: str) -> dict[str, Any]:
    """Register a video for analysis. `source` is a local file path or an http(s) URL
    (YouTube and other yt-dlp supported sites). Returns a video_id plus metadata.
    Reuse the video_id on the other tools. Does NOT transcribe or extract frames yet."""
    store.gc()
    video_id = store.make_id(source)
    work_dir = store.dir_for(video_id)

    if media.is_url(source):
        local_path = media.download_url(source, work_dir)
    else:
        candidate = Path(source).expanduser()
        if not candidate.exists():
            raise FileNotFoundError(f"file not found: {source}")
        local_path = candidate

    info = media.probe(local_path)
    entry = VideoEntry(
        video_id=video_id,
        source=source,
        path=local_path,
        duration=info.duration,
        width=info.width,
        height=info.height,
        fps=info.fps,
    )
    store.put(entry)
    return entry.to_public()


@mcp.tool()
def transcribe(
    video_id: str,
    language_code: str | None = None,
    diarize: bool = False,
) -> dict[str, Any]:
    """Transcribe the video's audio using ElevenLabs Scribe. Returns full text plus
    timestamped segments (with start/end in seconds). Use the segment timestamps to
    then call get_frame_at for the exact moment you care about. `language_code` is an
    optional ISO code (e.g. 'por', 'eng'); omit for auto-detect. `diarize` labels
    speakers when true. Result is cached on the video_id."""
    entry = store.get(video_id)
    if entry.transcript is not None:
        return _transcript_view(entry.transcript)

    work_dir = store.dir_for(video_id)
    audio_path = media.extract_audio(entry.path, work_dir / "audio.mp3")
    result = transcription.transcribe_file(
        audio_path, language_code=language_code, diarize=diarize
    )
    store.save_transcript(video_id, result)
    return _transcript_view(result)


@mcp.tool()
def search_transcript(video_id: str, query: str, limit: int = 5) -> list[dict[str, Any]]:
    """Search the (already produced) transcript for `query` and return matching
    segments with their timestamps, so you can pull the corresponding frame. Call
    transcribe first if no transcript exists yet."""
    entry = store.get(video_id)
    if entry.transcript is None:
        raise ValueError("no transcript yet; call transcribe first")
    q = query.lower().strip()
    matches: list[dict[str, Any]] = []
    for seg in entry.transcript.get("segments", []):
        if q in seg["text"].lower():
            matches.append(seg)
            if len(matches) >= limit:
                break
    return matches


@mcp.tool()
def get_frame_at(video_id: str, timestamp: float):
    """Extract a single frame (downscaled JPEG) at `timestamp` seconds and return it
    as an image the model can see. Ideal after finding a moment in the transcript."""
    entry = store.get(video_id)
    work_dir = store.dir_for(video_id)
    safe_ts = f"{max(timestamp, 0.0):.3f}".replace(".", "_")
    dest = work_dir / f"frame_{safe_ts}.jpg"
    media.extract_frame(entry.path, timestamp, dest)
    return Image(path=str(dest))


@mcp.tool()
def get_frames_at(video_id: str, timestamps: list[float]):
    """Extract multiple frames at the given `timestamps` (seconds). Capped at
    12 frames per call to protect the context window. Returns interleaved labels
    and images."""
    entry = store.get(video_id)
    work_dir = store.dir_for(video_id)
    if len(timestamps) > MAX_FRAMES_PER_CALL:
        raise ValueError(
            f"too many timestamps ({len(timestamps)}); max {MAX_FRAMES_PER_CALL} per call"
        )
    out: list[Image | str] = []
    for ts in timestamps:
        safe_ts = f"{max(ts, 0.0):.3f}".replace(".", "_")
        dest = work_dir / f"frame_{safe_ts}.jpg"
        media.extract_frame(entry.path, ts, dest)
        out.append(f"t={ts:.3f}s")
        out.append(Image(path=str(dest)))
    return out


@mcp.tool()
def extract_key_frames(
    video_id: str,
    mode: str = "transcript",
    every_seconds: float = 10.0,
    scene_threshold: float = 0.4,
    max_frames: int = MAX_FRAMES_PER_CALL,
    dedup: bool = True,
    dedup_threshold: int = 5,
):
    """Extract strategic representative frames across the whole video.

    Modes:
    - 'transcript' (best for talks/tutorials/screencasts): one frame per spoken
      segment, so each image aligns with what is being said. Requires transcribe first;
      falls back to 'scene' if no transcript exists.
    - 'scene': frames on visual scene changes (threshold 0-1, lower = more frames).
    - 'interval': one frame every `every_seconds`.

    `dedup=True` drops visually near-duplicate frames via perceptual hashing
    (`dedup_threshold` 0-64, lower = stricter). Returns at most `max_frames`
    (hard cap 12) interleaved timestamp labels and images."""
    entry = store.get(video_id)
    work_dir = store.dir_for(video_id)
    cap = min(max_frames, MAX_FRAMES_PER_CALL)

    frames = _collect_frames(entry, work_dir, mode, every_seconds, scene_threshold)
    if not frames:
        return ["no frames extracted; the video may be shorter than the sampling interval"]

    if dedup:
        frames = frameutil.dedup_by_phash(frames, threshold=dedup_threshold)
    frames = frameutil.thin_evenly(frames, cap)

    out: list[Image | str] = []
    for ts, fp in frames:
        out.append(f"t={ts:.3f}s")
        out.append(Image(path=str(fp)))
    return out


@mcp.tool()
def contact_sheet(
    video_id: str,
    mode: str = "transcript",
    every_seconds: float = 10.0,
    scene_threshold: float = 0.4,
    max_thumbs: int = 25,
    dedup: bool = True,
    dedup_threshold: int = 5,
) -> dict[str, Any]:
    """Build a single grid image (contact sheet) of thumbnails spanning the whole
    video, so you can eyeball the overview cheaply in one image and then decide which
    moments to fetch in full resolution with get_frames_at. Returns the sheet image
    plus the ordered list of timestamps (index -> seconds). `mode` behaves like
    extract_key_frames. Costs one downscaled image regardless of video length."""
    entry = store.get(video_id)
    work_dir = store.dir_for(video_id)

    frames = _collect_frames(entry, work_dir, mode, every_seconds, scene_threshold)
    if not frames:
        return {"error": "no frames extracted", "timestamps": []}

    if dedup:
        frames = frameutil.dedup_by_phash(frames, threshold=dedup_threshold)
    frames = frameutil.thin_evenly(frames, max(1, max_thumbs))

    sheet_path = work_dir / f"contact_sheet_{mode}.jpg"
    sheet_path, timestamps = frameutil.build_contact_sheet(frames, sheet_path)
    index = {str(i): round(ts, 3) for i, ts in enumerate(timestamps)}
    return {
        "sheet": Image(path=str(sheet_path)),
        "count": len(timestamps),
        "index_to_seconds": index,
        "hint": "pick indices, map to seconds via index_to_seconds, then call get_frames_at",
    }


def _collect_frames(
    entry: VideoEntry,
    work_dir: Path,
    mode: str,
    every_seconds: float,
    scene_threshold: float,
) -> list[tuple[float, Path]]:
    frames_dir = work_dir / f"frames_{mode}"
    frames_dir.mkdir(parents=True, exist_ok=True)
    for old in frames_dir.glob("*.jpg"):
        old.unlink()

    if mode == "interval":
        return media.extract_interval_frames(entry.path, frames_dir, every_seconds)

    if mode == "scene":
        frames = media.extract_scene_frames(entry.path, frames_dir, scene_threshold)
        if frames:
            return frames
        for old in frames_dir.glob("*.jpg"):
            old.unlink()
        return media.extract_interval_frames(entry.path, frames_dir, every_seconds)

    if mode == "transcript":
        if entry.transcript is None:
            return _collect_frames(
                entry, work_dir, "scene", every_seconds, scene_threshold
            )
        segments = entry.transcript.get("segments", [])
        timestamps = [
            (seg["start"] + seg["end"]) / 2.0 for seg in segments if "start" in seg
        ]
        return media.extract_frames_at(entry.path, frames_dir, timestamps)

    raise ValueError("mode must be 'transcript', 'scene' or 'interval'")


def _transcript_view(transcript: dict[str, Any]) -> dict[str, Any]:
    return {
        "language_code": transcript.get("language_code"),
        "text": transcript.get("text", ""),
        "segments": transcript.get("segments", []),
        "word_count": len(transcript.get("words", [])),
    }


def _build_http_app():
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import JSONResponse, PlainTextResponse
    from starlette.routing import Route

    expected = os.environ.get("MCP_AUTH_TOKEN")

    class BearerAuthMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            if request.url.path == "/health":
                return await call_next(request)
            if expected:
                header = request.headers.get("authorization", "")
                token = header[7:] if header.lower().startswith("bearer ") else ""
                if token != expected:
                    return JSONResponse({"error": "unauthorized"}, status_code=401)
            return await call_next(request)

    async def health(_request):
        return PlainTextResponse("ok")

    app = mcp.streamable_http_app()
    app.router.routes.append(Route("/health", health, methods=["GET"]))
    app.add_middleware(BearerAuthMiddleware)
    return app


def main() -> None:
    transport = os.environ.get("MCP_TRANSPORT", "stdio").lower()
    if transport in ("http", "streamable-http", "streamable_http"):
        import uvicorn

        from mcp.server.transport_security import TransportSecuritySettings

        mcp.settings.transport_security = TransportSecuritySettings(
            enable_dns_rebinding_protection=False
        )
        host = os.environ.get("HOST", "0.0.0.0")
        port = int(os.environ.get("PORT", "8080"))
        uvicorn.run(_build_http_app(), host=host, port=port, log_level="info")
    else:
        mcp.run()


if __name__ == "__main__":
    main()
