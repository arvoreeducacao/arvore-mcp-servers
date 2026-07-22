from __future__ import annotations

import math
from pathlib import Path

import imagehash
from PIL import Image as PILImage


def dedup_by_phash(
    frames: list[tuple[float, Path]], threshold: int = 5
) -> list[tuple[float, Path]]:
    """Drop visually near-duplicate frames. `threshold` is the max Hamming distance
    (0-64) between perceptual hashes to consider two frames the same; lower = stricter."""
    if not frames:
        return []
    kept: list[tuple[float, Path]] = []
    kept_hashes: list[imagehash.ImageHash] = []
    for ts, path in frames:
        try:
            with PILImage.open(path) as img:
                h = imagehash.phash(img)
        except OSError:
            continue
        if any((h - kh) <= threshold for kh in kept_hashes):
            continue
        kept.append((ts, path))
        kept_hashes.append(h)
    return kept


def thin_evenly(frames: list[tuple[float, Path]], cap: int) -> list[tuple[float, Path]]:
    if cap <= 0 or len(frames) <= cap:
        return frames
    step = len(frames) / cap
    return [frames[int(i * step)] for i in range(cap)]


def build_contact_sheet(
    frames: list[tuple[float, Path]],
    dest: Path,
    thumb: int = 200,
    cols: int = 5,
    label: bool = True,
) -> tuple[Path, list[float]]:
    """Compose frames into a single grid image (contact sheet). Returns the sheet
    path and the ordered list of timestamps, so the model can pick moments to fetch
    in high resolution afterwards."""
    if not frames:
        raise ValueError("no frames to build a contact sheet from")

    from PIL import ImageDraw

    count = len(frames)
    cols = max(1, min(cols, count))
    rows = math.ceil(count / cols)
    pad = 6
    label_h = 16 if label else 0
    cell_w = thumb + pad
    cell_h = thumb + label_h + pad
    sheet_w = cols * cell_w + pad
    sheet_h = rows * cell_h + pad

    sheet = PILImage.new("RGB", (sheet_w, sheet_h), (17, 17, 17))
    draw = ImageDraw.Draw(sheet)
    timestamps: list[float] = []

    for idx, (ts, path) in enumerate(frames):
        timestamps.append(ts)
        r, c = divmod(idx, cols)
        x = pad + c * cell_w
        y = pad + r * cell_h
        try:
            with PILImage.open(path) as img:
                img = img.convert("RGB")
                img.thumbnail((thumb, thumb))
                sheet.paste(img, (x, y))
        except OSError:
            continue
        if label:
            draw.text((x + 2, y + thumb + 2), f"#{idx}  {ts:.1f}s", fill=(230, 230, 230))

    sheet.save(dest, format="JPEG", quality=75)
    return dest, timestamps
