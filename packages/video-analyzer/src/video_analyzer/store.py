from __future__ import annotations

import hashlib
import json
import shutil
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


CACHE_ROOT = Path(tempfile.gettempdir()) / "arvore-video-analyzer"
TTL_SECONDS = 60 * 60 * 6


@dataclass
class VideoEntry:
    video_id: str
    source: str
    path: Path
    duration: float
    width: int
    height: int
    fps: float
    created_at: float = field(default_factory=time.time)
    transcript: dict[str, Any] | None = None

    def to_public(self) -> dict[str, Any]:
        return {
            "video_id": self.video_id,
            "source": self.source,
            "duration_seconds": round(self.duration, 3),
            "width": self.width,
            "height": self.height,
            "fps": round(self.fps, 3),
            "has_transcript": self.transcript is not None,
        }


class VideoStore:
    def __init__(self, root: Path = CACHE_ROOT, ttl: int = TTL_SECONDS) -> None:
        self.root = root
        self.ttl = ttl
        self.root.mkdir(parents=True, exist_ok=True)
        self._entries: dict[str, VideoEntry] = {}

    def make_id(self, source: str) -> str:
        digest = hashlib.sha1(f"{source}:{time.time()}".encode()).hexdigest()
        return digest[:12]

    def dir_for(self, video_id: str) -> Path:
        d = self.root / video_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def put(self, entry: VideoEntry) -> None:
        self._entries[entry.video_id] = entry
        self._persist(entry)

    def get(self, video_id: str) -> VideoEntry:
        entry = self._entries.get(video_id)
        if entry is None:
            entry = self._load(video_id)
        if entry is None:
            raise KeyError(
                f"unknown video_id '{video_id}'. Call load_video first, then reuse the returned id."
            )
        return entry

    def _meta_path(self, video_id: str) -> Path:
        return self.dir_for(video_id) / "meta.json"

    def _persist(self, entry: VideoEntry) -> None:
        meta = {
            "video_id": entry.video_id,
            "source": entry.source,
            "path": str(entry.path),
            "duration": entry.duration,
            "width": entry.width,
            "height": entry.height,
            "fps": entry.fps,
            "created_at": entry.created_at,
            "transcript": entry.transcript,
        }
        self._meta_path(entry.video_id).write_text(json.dumps(meta))

    def _load(self, video_id: str) -> VideoEntry | None:
        meta_path = self._meta_path(video_id)
        if not meta_path.exists():
            return None
        try:
            meta = json.loads(meta_path.read_text())
        except (json.JSONDecodeError, OSError):
            return None
        path = Path(meta["path"])
        if not path.exists():
            return None
        entry = VideoEntry(
            video_id=meta["video_id"],
            source=meta["source"],
            path=path,
            duration=meta["duration"],
            width=meta["width"],
            height=meta["height"],
            fps=meta["fps"],
            created_at=meta.get("created_at", time.time()),
            transcript=meta.get("transcript"),
        )
        self._entries[video_id] = entry
        return entry

    def save_transcript(self, video_id: str, transcript: dict[str, Any]) -> None:
        entry = self.get(video_id)
        entry.transcript = transcript
        self._persist(entry)

    def gc(self) -> int:
        removed = 0
        now = time.time()
        for child in self.root.iterdir():
            if not child.is_dir():
                continue
            meta_path = child / "meta.json"
            created = child.stat().st_mtime
            if meta_path.exists():
                try:
                    created = json.loads(meta_path.read_text()).get("created_at", created)
                except (json.JSONDecodeError, OSError):
                    pass
            if now - created > self.ttl:
                shutil.rmtree(child, ignore_errors=True)
                self._entries.pop(child.name, None)
                removed += 1
        return removed
