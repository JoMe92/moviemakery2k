/**
 * Pure drag math for the timeline view's trim handles (design.md D7): turns a
 * pointer-drag delta in pixels into an already-clamped new picture duration or
 * video trim range, so the live drag can call the validated store actions
 * (`setSlideDuration`/`setVideoTrim`) on every pointer move and always
 * succeed, never landing outside their allowed range.
 *
 * A picture has no `trimIn` of its own, so either edge changes the same
 * display duration (design.md D7: "bei Bildern die Anzeigedauer"); a video
 * clip's two edges change `trimIn`/`trimOut` independently, each kept at
 * least `MIN_VIDEO_TRIM_GAP` away from the other so the result always
 * satisfies the backend's strict `trimIn < trimOut`.
 */
import { SLIDE_DURATION } from "../store/projectOps";

export type Edge = "start" | "end";

export const MIN_VIDEO_TRIM_GAP = 0.1;

function clampToSlideGrid(value: number): number {
  const stepped = Math.round(value / SLIDE_DURATION.step) * SLIDE_DURATION.step;
  return Math.min(Math.max(stepped, SLIDE_DURATION.min), SLIDE_DURATION.max);
}

/** New picture duration after dragging `edge` by `deltaSeconds`. */
export function dragImageDuration(edge: Edge, current: number, deltaSeconds: number): number {
  const raw = edge === "end" ? current + deltaSeconds : current - deltaSeconds;
  return clampToSlideGrid(raw);
}

export interface VideoTrim {
  trimIn: number;
  trimOut: number;
}

/** New trim range after dragging `edge` of a video clip by `deltaSeconds`;
 * stays within `0 <= trimIn < trimOut <= fileDuration` (design.md D3). */
export function dragVideoTrim(
  edge: Edge,
  current: VideoTrim,
  fileDuration: number,
  deltaSeconds: number,
): VideoTrim {
  if (edge === "start") {
    const trimIn = Math.min(
      Math.max(current.trimIn + deltaSeconds, 0),
      current.trimOut - MIN_VIDEO_TRIM_GAP,
    );
    return { trimIn, trimOut: current.trimOut };
  }
  const trimOut = Math.max(
    Math.min(current.trimOut + deltaSeconds, fileDuration),
    current.trimIn + MIN_VIDEO_TRIM_GAP,
  );
  return { trimIn: current.trimIn, trimOut };
}
