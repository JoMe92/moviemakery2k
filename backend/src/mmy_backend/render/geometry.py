"""Geometrie des 4:3-Frame-Raums, 1:1 aus `apps/web/src/render/geometry.ts` (design.md D4)."""

import math
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Rect:
    x: int
    y: int
    width: int
    height: int


def _js_round(value: float) -> int:
    """`Math.round`: halbe Werte runden Richtung +∞ (Python `round` rundet zur geraden Zahl)."""
    return math.floor(value + 0.5)


def contain_rect(src_w: int, src_h: int, dst_w: int, dst_h: int) -> Rect:
    """Größtes mittiges Rechteck mit dem Seitenverhältnis der Quelle im Ziel, ganzzahlig."""
    if src_w <= 0 or src_h <= 0 or dst_w <= 0 or dst_h <= 0:
        return Rect(0, 0, 0, 0)
    scale = min(dst_w / src_w, dst_h / src_h)
    width = min(dst_w, max(1, _js_round(src_w * scale)))
    height = min(dst_h, max(1, _js_round(src_h * scale)))
    return Rect(
        x=math.floor((dst_w - width) / 2),
        y=math.floor((dst_h - height) / 2),
        width=width,
        height=height,
    )
