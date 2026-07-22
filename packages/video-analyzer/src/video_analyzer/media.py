from __future__ import annotations

import base64
import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


class MediaError(RuntimeError):
    pass


def _require(binary: str) -> str:
    resolved = shutil.which(binary)
    if resolved is None:
        raise MediaError(
            f"'{binary}' not found on PATH. Install it (e.g. `brew install {binary}`)."
        )
    return resolved


def _run(cmd: list[str], timeout: int = 900) -> subprocess.CompletedProcess[bytes]:
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise MediaError(f"command timed out after {timeout}s: {cmd[0]}") from exc
    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace")[-800:]
        raise MediaError(f"{cmd[0]} failed (code {proc.returncode}):\n{stderr}")
    return proc


@dataclass
class Probe:
    duration: float
    width: int
    height: int
    fps: float


def is_url(source: str) -> bool:
    return source.startswith(("http://", "https://"))


def download_url(source: str, dest_dir: Path) -> Path:
    ytdlp = _require("yt-dlp")
    out_template = str(dest_dir / "source.%(ext)s")
    cmd = [
        ytdlp,
        "--extractor-args",
        "youtube:player_client=android,ios,web",
        "-f",
        "bv*[height<=720]+ba/b[height<=720]/b/18",
        "--merge-output-format",
        "mp4",
        "--no-playlist",
        "-o",
        out_template,
    ]
    node = shutil.which("node")
    if node:
        cmd[1:1] = ["--js-runtimes", "node"]
    cmd.append(source)
    _run(cmd)
    candidates = sorted(dest_dir.glob("source.*"))
    if not candidates:
        raise MediaError(f"yt-dlp produced no file for {source}")
    return candidates[0]


def probe(path: Path) -> Probe:
    ffprobe = _require("ffprobe")
    proc = _run(
        [
            ffprobe,
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,avg_frame_rate:format=duration",
            "-of",
            "json",
            str(path),
        ],
        timeout=120,
    )
    data = json.loads(proc.stdout.decode("utf-8", errors="replace"))
    stream = (data.get("streams") or [{}])[0]
    fmt = data.get("format") or {}
    width = int(stream.get("width") or 0)
    height = int(stream.get("height") or 0)
    duration = float(fmt.get("duration") or 0.0)
    fps = _parse_fps(stream.get("avg_frame_rate"))
    return Probe(duration=duration, width=width, height=height, fps=fps)


def _parse_fps(raw: str | None) -> float:
    if not raw or raw == "0/0":
        return 0.0
    if "/" in raw:
        num, den = raw.split("/", 1)
        den_f = float(den)
        return float(num) / den_f if den_f else 0.0
    return float(raw)


def extract_audio(path: Path, dest: Path) -> Path:
    ffmpeg = _require("ffmpeg")
    _run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "4",
            str(dest),
        ]
    )
    if not dest.exists():
        raise MediaError("audio extraction produced no output")
    return dest


def extract_frame(path: Path, timestamp: float, dest: Path, max_dim: int = 768) -> Path:
    ffmpeg = _require("ffmpeg")
    scale = (
        f"scale='if(gt(iw,ih),min({max_dim},iw),-2)':"
        f"'if(gt(iw,ih),-2,min({max_dim},ih))'"
    )
    _run(
        [
            ffmpeg,
            "-y",
            "-ss",
            f"{max(timestamp, 0):.3f}",
            "-i",
            str(path),
            "-frames:v",
            "1",
            "-vf",
            scale,
            "-q:v",
            "4",
            str(dest),
        ],
        timeout=120,
    )
    if not dest.exists():
        raise MediaError(f"no frame extracted at {timestamp:.3f}s")
    return dest


def extract_frames_at(
    path: Path, dest_dir: Path, timestamps: list[float], max_dim: int = 768
) -> list[tuple[float, Path]]:
    result: list[tuple[float, Path]] = []
    for idx, ts in enumerate(timestamps):
        dest = dest_dir / f"ts_{idx:05d}.jpg"
        try:
            extract_frame(path, ts, dest, max_dim=max_dim)
        except MediaError:
            continue
        result.append((ts, dest))
    return result


def extract_interval_frames(
    path: Path, dest_dir: Path, every_seconds: float, max_dim: int = 768
) -> list[tuple[float, Path]]:
    ffmpeg = _require("ffmpeg")
    fps_expr = 1.0 / every_seconds
    scale = (
        f"scale='if(gt(iw,ih),min({max_dim},iw),-2)':"
        f"'if(gt(iw,ih),-2,min({max_dim},ih))'"
    )
    pattern = str(dest_dir / "frame_%05d.jpg")
    _run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(path),
            "-vf",
            f"fps={fps_expr},{scale}",
            "-q:v",
            "4",
            pattern,
        ]
    )
    frames = sorted(dest_dir.glob("frame_*.jpg"))
    return [((idx) * every_seconds, fp) for idx, fp in enumerate(frames)]


def extract_scene_frames(
    path: Path, dest_dir: Path, threshold: float = 0.4, max_dim: int = 768
) -> list[tuple[float, Path]]:
    ffmpeg = _require("ffmpeg")
    scale = (
        f"scale='if(gt(iw,ih),min({max_dim},iw),-2)':"
        f"'if(gt(iw,ih),-2,min({max_dim},ih))'"
    )
    pattern = str(dest_dir / "scene_%05d.jpg")
    try:
        proc = _run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(path),
                "-vf",
                f"select='gt(scene,{threshold})',{scale},showinfo",
                "-vsync",
                "vfr",
                "-frames:v",
                "60",
                pattern,
            ]
        )
    except MediaError:
        frames = sorted(dest_dir.glob("scene_*.jpg"))
        if not frames:
            return []
        raise
    timestamps = _parse_showinfo_times(proc.stderr.decode("utf-8", errors="replace"))
    frames = sorted(dest_dir.glob("scene_*.jpg"))
    result: list[tuple[float, Path]] = []
    for idx, fp in enumerate(frames):
        ts = timestamps[idx] if idx < len(timestamps) else float(idx)
        result.append((ts, fp))
    return result


def _parse_showinfo_times(stderr: str) -> list[float]:
    times: list[float] = []
    for line in stderr.splitlines():
        marker = "pts_time:"
        if marker in line:
            frag = line.split(marker, 1)[1].strip().split(" ", 1)[0]
            try:
                times.append(float(frag))
            except ValueError:
                continue
    return times


def encode_image(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")
