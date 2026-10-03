"""Position/zoom interpolation for the three title phases, 1:1 from
`apps/web/src/render/titlePhase.ts` (design.md D3 of add-titles-and-credits).

Each phase (Entrance → Main → Exit) is a start→end pair; Nachspann-Scroll is
the same mechanism with start != end during "Main" - no separate scroll
concept. Values are in the clip-space convention of `title-vertex.glsl`:
`translate` 0 = centred, +-1 = one half-frame; `scale` 1.0 = natural size.
"""

from dataclasses import dataclass

# Default Entrance/Exit duration (design.md "Standardwerte"); the rest is Main.
DEFAULT_ENTRANCE_SECONDS = 1.0
DEFAULT_EXIT_SECONDS = 1.0


@dataclass(frozen=True, slots=True)
class Translate:
    x: float
    y: float


@dataclass(frozen=True, slots=True)
class Transform:
    translate: Translate
    scale: float


@dataclass(frozen=True, slots=True)
class PhaseKeyframes:
    start: Transform
    end: Transform


@dataclass(frozen=True, slots=True)
class TitlePhases:
    entrance: PhaseKeyframes
    main: PhaseKeyframes
    exit: PhaseKeyframes


@dataclass(frozen=True, slots=True)
class PhaseDurations:
    entrance_seconds: float
    exit_seconds: float
    total_seconds: float


def identity_transform() -> Transform:
    return Transform(translate=Translate(0.0, 0.0), scale=1.0)


def static_phases() -> TitlePhases:
    """A style with no phase animation: every phase holds the identity transform."""
    hold = PhaseKeyframes(start=identity_transform(), end=identity_transform())
    return TitlePhases(entrance=hold, main=hold, exit=hold)


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def _lerp_transform(a: Transform, b: Transform, t: float) -> Transform:
    return Transform(
        translate=Translate(
            x=_lerp(a.translate.x, b.translate.x, t),
            y=_lerp(a.translate.y, b.translate.y, t),
        ),
        scale=_lerp(a.scale, b.scale, t),
    )


def title_transform_at(
    phases: TitlePhases, durations: PhaseDurations, elapsed_seconds: float
) -> Transform:
    """The transform at `elapsed_seconds` into the title's display duration.

    Clamped to [0, total_seconds]; a zero-length phase holds its end value.
    """
    t = min(max(elapsed_seconds, 0.0), durations.total_seconds)
    main_seconds = max(
        0.0, durations.total_seconds - durations.entrance_seconds - durations.exit_seconds
    )
    if t < durations.entrance_seconds:
        p = t / durations.entrance_seconds if durations.entrance_seconds > 0 else 1.0
        return _lerp_transform(phases.entrance.start, phases.entrance.end, p)
    exit_start = durations.entrance_seconds + main_seconds
    if t < exit_start:
        p = (t - durations.entrance_seconds) / main_seconds if main_seconds > 0 else 1.0
        return _lerp_transform(phases.main.start, phases.main.end, p)
    p = (t - exit_start) / durations.exit_seconds if durations.exit_seconds > 0 else 1.0
    return _lerp_transform(phases.exit.start, phases.exit.end, p)
