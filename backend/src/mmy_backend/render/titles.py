"""Bridge between a title catalog entry and the render building blocks
(add-titles-and-credits design.md D1-D4), 1:1 from
`apps/web/src/titles/titleRender.ts` so preview and export compute the same
position, zoom and opacity for the same moment.

`fade` becomes an alpha ramp, `position` a start->end transform pair, and
`static` holds the style's anchor. A credits scroll is a `position` phase
during Main - the same mechanism, no second scroll concept (D3).
"""

from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from mmy_backend.project import Slide, TitleOverlay, TitleSlide
from mmy_backend.render.text import rasterize_credits, rasterize_title
from mmy_backend.render.title_phase import (
    DEFAULT_ENTRANCE_SECONDS,
    DEFAULT_EXIT_SECONDS,
    PhaseDurations,
    PhaseKeyframes,
    TitlePhases,
    Transform,
    Translate,
    title_transform_at,
)
from mmy_backend.title_catalog import Phase, Title
from mmy_backend.title_catalog import Transform as CatalogTransform

type AnyTitle = TitleSlide | TitleOverlay

# Base text size relative to the frame height (same constant as the web side).
FONT_FRACTION = 0.12


def _transform_of(anchor: CatalogTransform) -> Transform:
    return Transform(translate=Translate(x=anchor.x, y=anchor.y), scale=anchor.scale)


def _keyframes(phase: Phase, anchor: CatalogTransform) -> PhaseKeyframes:
    """One phase's start->end transform pair; `fade`/`static` hold the anchor."""
    if phase.effect == "position":
        return PhaseKeyframes(
            start=Transform(
                translate=Translate(x=phase.start.x, y=phase.start.y), scale=phase.start.scale
            ),
            end=Transform(translate=Translate(x=phase.end.x, y=phase.end.y), scale=phase.end.scale),
        )
    hold = _transform_of(anchor)
    return PhaseKeyframes(start=hold, end=hold)


def phases_of(style: Title) -> TitlePhases:
    """The style's three phases as the keyframes `title_transform_at` wants."""
    return TitlePhases(
        entrance=_keyframes(style.phases.entrance, style.anchor),
        main=_keyframes(style.phases.main, style.anchor),
        exit=_keyframes(style.phases.exit, style.anchor),
    )


def durations_of(total_seconds: float) -> PhaseDurations:
    """Entrance/Exit last 1 s each, the rest is Main (design.md "Standardwerte").

    A title shorter than 2 s splits its time evenly instead, so Main never
    becomes negative.
    """
    wanted = DEFAULT_ENTRANCE_SECONDS + DEFAULT_EXIT_SECONDS
    if total_seconds >= wanted:
        return PhaseDurations(
            entrance_seconds=DEFAULT_ENTRANCE_SECONDS,
            exit_seconds=DEFAULT_EXIT_SECONDS,
            total_seconds=total_seconds,
        )
    half = max(0.0, total_seconds / 2)
    return PhaseDurations(entrance_seconds=half, exit_seconds=half, total_seconds=total_seconds)


def title_alpha_at(style: Title, durations: PhaseDurations, elapsed_seconds: float) -> float:
    """Phase opacity: a `fade` entrance ramps 0->1, a `fade` exit 1->0, else 1."""
    t = min(max(elapsed_seconds, 0.0), durations.total_seconds)
    main_seconds = max(
        0.0, durations.total_seconds - durations.entrance_seconds - durations.exit_seconds
    )
    if t < durations.entrance_seconds:
        if style.phases.entrance.effect != "fade":
            return 1.0
        return t / durations.entrance_seconds if durations.entrance_seconds > 0 else 1.0
    exit_start = durations.entrance_seconds + main_seconds
    if t < exit_start:
        return 1.0
    if style.phases.exit.effect != "fade":
        return 1.0
    if durations.exit_seconds <= 0:
        return 0.0
    return max(0.0, 1.0 - (t - exit_start) / durations.exit_seconds)


@dataclass(frozen=True, slots=True)
class TitleDraw:
    """Everything one draw of a title needs."""

    transform: Transform
    alpha: float
    blend: bool
    """An overlay always blends; a freestanding title only while it fades."""


def title_draw_at(
    style: Title, total_seconds: float, elapsed_seconds: float, *, overlay: bool
) -> TitleDraw:
    """The transform, alpha and blend mode of a title at `elapsed_seconds`."""
    durations = durations_of(total_seconds)
    alpha = title_alpha_at(style, durations, elapsed_seconds)
    return TitleDraw(
        transform=title_transform_at(phases_of(style), durations, elapsed_seconds),
        alpha=alpha,
        blend=overlay or alpha < 1.0,
    )


def title_lines(title: AnyTitle) -> list[str]:
    """The text a title element or overlay shows, whichever field carries it."""
    if isinstance(title, TitleSlide) and title.credit_entries is not None:
        return list(title.credit_entries)
    return list(title.lines or [])


def _rgba(color: str) -> tuple[int, int, int, int]:
    """`#rrggbb` as an opaque RGBA tuple (the model validates the format)."""
    value = color.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), 255)


def rasterize_for(
    title: AnyTitle,
    style: Title,
    *,
    width: int,
    height: int,
    font_file: Path,
    overlay: bool,
) -> Image.Image:
    """Rasterises a title element or overlay for a `width` x `height` frame
    (design.md D1): a freestanding element paints its own opaque black
    background, an overlay stays transparent, and a credits list is sized to
    its content height rather than the buffer (D3)."""
    font_px = max(8.0, round(height * FONT_FRACTION * style.font_scale))
    lines = title_lines(title)
    color = _rgba(title.color)
    if style.layout == "credits" and not overlay:
        return rasterize_credits(
            lines, width=width, font_file=font_file, font_px=font_px, color=color
        )
    return rasterize_title(
        lines,
        width=width,
        height=height,
        font_file=font_file,
        font_px=font_px,
        color=color,
        opaque_background=not overlay,
    )


def title_of_slide(slide: Slide) -> tuple[AnyTitle, bool] | None:
    """The title a storyboard element shows and whether it is an overlay."""
    if slide.kind == "title":
        return (slide, False)
    return (slide.title, True) if slide.title is not None else None
