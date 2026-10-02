"""Geometry of the 4:3 frame space, 1:1 from `apps/web/src/render/geometry.ts` (design.md D4)."""

import math
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Rect:
    x: int
    y: int
    width: int
    height: int


def _js_round(value: float) -> int:
    """`Math.round`: halves round towards +∞ (Python `round` rounds to the even number)."""
    return math.floor(value + 0.5)


def contain_rect(src_w: int, src_h: int, dst_w: int, dst_h: int) -> Rect:
    """Largest centred rectangle with the source aspect ratio inside the target, integral."""
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
