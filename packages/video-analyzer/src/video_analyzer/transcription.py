from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx


ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"
DEFAULT_MODEL = "scribe_v1"


class TranscriptionError(RuntimeError):
    pass


def _api_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise TranscriptionError(
            "ELEVENLABS_API_KEY is not set in the environment."
        )
    return key


def transcribe_file(
    audio_path: Path,
    language_code: str | None = None,
    diarize: bool = False,
    model_id: str = DEFAULT_MODEL,
    timeout: float = 600.0,
) -> dict[str, Any]:
    data: dict[str, str] = {
        "model_id": model_id,
        "timestamps_granularity": "word",
        "diarize": "true" if diarize else "false",
    }
    if language_code:
        data["language_code"] = language_code

    with audio_path.open("rb") as fh:
        files = {"file": (audio_path.name, fh, "audio/mpeg")}
        try:
            response = httpx.post(
                ELEVENLABS_STT_URL,
                headers={"xi-api-key": _api_key()},
                data=data,
                files=files,
                timeout=timeout,
            )
        except httpx.HTTPError as exc:
            raise TranscriptionError(f"request to ElevenLabs failed: {exc}") from exc

    if response.status_code != 200:
        raise TranscriptionError(
            f"ElevenLabs STT returned {response.status_code}: {response.text[:500]}"
        )

    payload = response.json()
    return _normalize(payload)


def _normalize(payload: dict[str, Any]) -> dict[str, Any]:
    words_raw = payload.get("words") or []
    words: list[dict[str, Any]] = []
    for w in words_raw:
        if w.get("type") not in (None, "word"):
            continue
        start = w.get("start")
        if start is None:
            continue
        words.append(
            {
                "text": w.get("text", ""),
                "start": float(start),
                "end": float(w.get("end", start)),
                "speaker": w.get("speaker_id"),
            }
        )

    segments = _segment(words)
    return {
        "language_code": payload.get("language_code"),
        "text": payload.get("text", "").strip(),
        "words": words,
        "segments": segments,
    }


def _segment(words: list[dict[str, Any]], max_gap: float = 0.8, max_len: float = 12.0) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    current: list[dict[str, Any]] = []

    def flush() -> None:
        if not current:
            return
        segments.append(
            {
                "start": current[0]["start"],
                "end": current[-1]["end"],
                "text": "".join(_join(current)).strip(),
                "speaker": current[0].get("speaker"),
            }
        )

    for word in words:
        if current:
            gap = word["start"] - current[-1]["end"]
            span = word["end"] - current[0]["start"]
            speaker_changed = word.get("speaker") != current[0].get("speaker")
            if gap > max_gap or span > max_len or speaker_changed:
                flush()
                current = []
        current.append(word)
    flush()
    return segments


def _join(words: list[dict[str, Any]]) -> list[str]:
    parts: list[str] = []
    for i, w in enumerate(words):
        text = w["text"]
        if i > 0 and not text.startswith((" ", ",", ".", "!", "?", ";", ":")):
            parts.append(" ")
        parts.append(text)
    return parts
