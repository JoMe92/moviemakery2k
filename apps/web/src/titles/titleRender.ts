/**
 * Bridge between a title catalog entry and the renderer's title building
 * blocks (add-titles-and-credits design.md D1-D4): it turns one style's
 * `anchor`, `fontScale` and three phase effects into
 *
 * - a rasterised image source (`rasterizeTitle` / `rasterizeCredits`), and
 * - the `uTranslate`/`uScale`/`uAlpha` values for a given moment.
 *
 * `fade` becomes an alpha ramp, `position` a start→end transform pair, and
 * `static` holds the style's anchor. A credits scroll is a `position` phase
 * during Main - the same mechanism, no second scroll concept (D3).
 */

import type { Slide, TitleOverlay, TitleSlide, TitleStyle } from "../lib/apiClient";
import {
  DEFAULT_ENTRANCE_SECONDS,
  DEFAULT_EXIT_SECONDS,
  type PhaseKeyframes,
  type TitlePhases,
  type Transform,
  titleTransformAt,
} from "../render/titlePhase";
import { rasterizeCredits, rasterizeTitle } from "../render/titleText";
import { isCredits } from "./titleStyle";

type Phase = TitleStyle["phases"]["entrance"];

/** Base text size relative to the frame height (estimated from the original). */
const FONT_FRACTION = 0.12;

function transformOf(anchor: TitleStyle["anchor"]): Transform {
  return { translate: { x: anchor.x, y: anchor.y }, scale: anchor.scale };
}

/** One phase's start→end transform pair; `fade`/`static` hold the anchor. */
function keyframes(phase: Phase, anchor: TitleStyle["anchor"]): PhaseKeyframes {
  if (phase.effect === "position") {
    return {
      start: { translate: { x: phase.start.x, y: phase.start.y }, scale: phase.start.scale },
      end: { translate: { x: phase.end.x, y: phase.end.y }, scale: phase.end.scale },
    };
  }
  const hold = transformOf(anchor);
  return { start: hold, end: hold };
}

/** The style's three phases as the position/zoom keyframes `titleTransformAt` wants. */
export function phasesOf(style: TitleStyle): TitlePhases {
  return {
    entrance: keyframes(style.phases.entrance, style.anchor),
    main: keyframes(style.phases.main, style.anchor),
    exit: keyframes(style.phases.exit, style.anchor),
  };
}

export interface PhaseDurations {
  entranceSeconds: number;
  exitSeconds: number;
  totalSeconds: number;
}

/**
 * Entrance/Exit last 1 s each, the rest is Main (design.md "Standardwerte").
 * A title shorter than 2 s splits its time evenly instead, so Main never
 * becomes negative.
 */
export function durationsOf(totalSeconds: number): PhaseDurations {
  const wanted = DEFAULT_ENTRANCE_SECONDS + DEFAULT_EXIT_SECONDS;
  if (totalSeconds >= wanted) {
    return {
      entranceSeconds: DEFAULT_ENTRANCE_SECONDS,
      exitSeconds: DEFAULT_EXIT_SECONDS,
      totalSeconds,
    };
  }
  const half = Math.max(0, totalSeconds / 2);
  return { entranceSeconds: half, exitSeconds: half, totalSeconds };
}

/**
 * Phase opacity at `elapsedSeconds`: a `fade` entrance ramps 0→1 over its
 * phase, a `fade` exit ramps 1→0, everything else stays fully visible.
 */
export function titleAlphaAt(
  style: TitleStyle,
  durations: PhaseDurations,
  elapsedSeconds: number,
): number {
  const t = Math.min(Math.max(elapsedSeconds, 0), durations.totalSeconds);
  const mainSeconds = Math.max(
    0,
    durations.totalSeconds - durations.entranceSeconds - durations.exitSeconds,
  );
  if (t < durations.entranceSeconds) {
    if (style.phases.entrance.effect !== "fade") return 1;
    return durations.entranceSeconds > 0 ? t / durations.entranceSeconds : 1;
  }
  const exitStart = durations.entranceSeconds + mainSeconds;
  if (t < exitStart) return 1;
  if (style.phases.exit.effect !== "fade") return 1;
  if (durations.exitSeconds <= 0) return 0;
  return Math.max(0, 1 - (t - exitStart) / durations.exitSeconds);
}

/** Everything one draw of a title needs. */
export interface TitleDraw {
  transform: Transform;
  alpha: number;
  /** An overlay always blends; a freestanding title only while it fades. */
  blend: boolean;
}

/** The transform, alpha and blend mode of a title at `elapsedSeconds`. */
export function titleDrawAt(
  style: TitleStyle,
  totalSeconds: number,
  elapsedSeconds: number,
  overlay: boolean,
): TitleDraw {
  const durations = durationsOf(totalSeconds);
  const alpha = titleAlphaAt(style, durations, elapsedSeconds);
  return {
    transform: titleTransformAt(phasesOf(style), durations, elapsedSeconds),
    alpha,
    blend: overlay || alpha < 1,
  };
}

/** The text a title element or overlay shows, whichever field carries it. */
export function titleLines(title: TitleSlide | TitleOverlay): string[] {
  if ("creditEntries" in title && title.creditEntries) return title.creditEntries;
  return title.lines ?? [];
}

export interface RasterSize {
  width: number;
  height: number;
}

/**
 * Rasterises a title element or overlay for a buffer of `size`
 * (design.md D1): a freestanding element paints its own opaque black
 * background, an overlay stays transparent, and a credits list is sized to
 * its content height rather than the buffer (D3).
 */
export function rasterizeFor(
  title: TitleSlide | TitleOverlay,
  style: TitleStyle,
  size: RasterSize,
  overlay: boolean,
): HTMLCanvasElement {
  const fontPx = Math.max(8, Math.round(size.height * FONT_FRACTION * style.fontScale));
  const lines = titleLines(title);
  if (isCredits(style.layout) && !overlay) {
    return rasterizeCredits(lines, { width: size.width, fontPx, color: title.color });
  }
  return rasterizeTitle(lines, {
    width: size.width,
    height: size.height,
    fontPx,
    color: title.color,
    opaqueBackground: !overlay,
  });
}

/** Display name of the style a title element or overlay uses. */
export function titleStyleOf(
  catalog: readonly TitleStyle[],
  title: Pick<TitleSlide, "styleId">,
): TitleStyle | undefined {
  return catalog.find((s) => s.id === title.styleId);
}

/**
 * First non-empty line of a title, for tiles and labels; `fallback` when the
 * title has no text yet.
 */
export function titleLabel(title: TitleSlide | TitleOverlay, fallback: string): string {
  return titleLines(title).find((line) => line.trim().length > 0) ?? fallback;
}

/** The overlay title of an element, or null (a title element has none). */
export function overlayOf(slide: Slide): TitleOverlay | null {
  return slide.kind === "title" ? null : slide.title;
}
