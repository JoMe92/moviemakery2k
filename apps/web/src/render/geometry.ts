/** Pure geometry for the 4:3 frame space (design.md D4). */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Aspect ratio of the monitor and the export. */
export const FRAME_ASPECT = 4 / 3;

/**
 * Largest rectangle with the source's aspect ratio that fits entirely inside the
 * target, centred ("contain"). Integer-valued so the edges against the black
 * bars do not blur.
 */
export function containRect(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const width = Math.min(dstW, Math.max(1, Math.round(srcW * scale)));
  const height = Math.min(dstH, Math.max(1, Math.round(srcH * scale)));
  return {
    x: Math.floor((dstW - width) / 2),
    y: Math.floor((dstH - height) / 2),
    width,
    height,
  };
}

/**
 * Pixel size of the drawing buffer: the largest 4:3 area in the CSS box, times
 * DPR, integer-valued and exactly 4:3 (width divisible by 4), capped at `maxSize`.
 */
export function bufferSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  maxSize = Number.POSITIVE_INFINITY,
): { width: number; height: number } {
  const ratio = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const cssW = Math.max(0, Math.min(cssWidth, cssHeight * FRAME_ASPECT));
  const limit = Math.max(4, Math.min(cssW * ratio, maxSize));
  const unit = Math.max(1, Math.floor(limit / 4));
  return { width: unit * 4, height: unit * 3 };
}

/** Preview limits on phones and everywhere (add-mobile-layout design.md D14). */
export const PREVIEW_MAX_DPR = 2;
export const PREVIEW_MAX_WIDTH = 1920;

/**
 * Drawing buffer of the preview monitor: CSS size × min(devicePixelRatio, 2),
 * at most 1920 px wide (and at most `maxSize`, the GPU limit).
 */
export function previewBufferSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  maxSize = Number.POSITIVE_INFINITY,
): { width: number; height: number } {
  const ratio = dpr > 0 && Number.isFinite(dpr) ? Math.min(dpr, PREVIEW_MAX_DPR) : 1;
  return bufferSize(cssWidth, cssHeight, ratio, Math.min(maxSize, PREVIEW_MAX_WIDTH));
}
