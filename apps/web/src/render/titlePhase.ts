/**
 * Pure position/zoom interpolation for the three title phases
 * (Entrance → Main → Exit), each a start→end pair, design.md D3 of
 * `add-titles-and-credits`. Nachspann-Scroll is the same mechanism with
 * start ≠ end during "Main" — no separate scroll concept.
 *
 * Values are in the clip-space convention of `title-vertex.glsl`:
 * `translate` 0 = centred, ±1 = one half-frame; `scale` 1.0 = natural size.
 */

export interface Transform {
  readonly translate: { readonly x: number; readonly y: number };
  readonly scale: number;
}

export interface PhaseKeyframes {
  readonly start: Transform;
  readonly end: Transform;
}

export interface TitlePhases {
  readonly entrance: PhaseKeyframes;
  readonly main: PhaseKeyframes;
  readonly exit: PhaseKeyframes;
}

/** Default Entrance/Exit duration (design.md "Standardwerte"); the rest is Main. */
export const DEFAULT_ENTRANCE_SECONDS = 1;
export const DEFAULT_EXIT_SECONDS = 1;

export interface PhaseDurations {
  readonly entranceSeconds: number;
  readonly exitSeconds: number;
  readonly totalSeconds: number;
}

export function identityTransform(): Transform {
  return { translate: { x: 0, y: 0 }, scale: 1 };
}

/** A style with no phase animation: every phase holds the identity transform. */
export function staticPhases(): TitlePhases {
  const hold = { start: identityTransform(), end: identityTransform() };
  return { entrance: hold, main: hold, exit: hold };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpTransform(a: Transform, b: Transform, t: number): Transform {
  return {
    translate: {
      x: lerp(a.translate.x, b.translate.x, t),
      y: lerp(a.translate.y, b.translate.y, t),
    },
    scale: lerp(a.scale, b.scale, t),
  };
}

/**
 * The transform at `elapsedSeconds` into the title's display duration.
 * Clamped to [0, totalSeconds]; a zero-length phase holds its end value.
 */
export function titleTransformAt(
  phases: TitlePhases,
  durations: PhaseDurations,
  elapsedSeconds: number,
): Transform {
  const t = Math.min(Math.max(elapsedSeconds, 0), durations.totalSeconds);
  const mainSeconds = Math.max(
    0,
    durations.totalSeconds - durations.entranceSeconds - durations.exitSeconds,
  );
  if (t < durations.entranceSeconds) {
    const p = durations.entranceSeconds > 0 ? t / durations.entranceSeconds : 1;
    return lerpTransform(phases.entrance.start, phases.entrance.end, p);
  }
  const exitStart = durations.entranceSeconds + mainSeconds;
  if (t < exitStart) {
    const p = mainSeconds > 0 ? (t - durations.entranceSeconds) / mainSeconds : 1;
    return lerpTransform(phases.main.start, phases.main.end, p);
  }
  const p = durations.exitSeconds > 0 ? (t - exitStart) / durations.exitSeconds : 1;
  return lerpTransform(phases.exit.start, phases.exit.end, p);
}
