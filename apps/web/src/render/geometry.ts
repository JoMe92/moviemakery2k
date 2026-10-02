/** Reine Geometrie für den 4:3-Frame-Raum (design.md D4). */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Seitenverhältnis des Monitors und des Exports. */
export const FRAME_ASPECT = 4 / 3;

/**
 * Größtes Rechteck mit dem Seitenverhältnis der Quelle, das vollständig in das
 * Ziel passt, mittig („contain“). Ganzzahlig, damit die Kanten zu den schwarzen
 * Balken nicht verschwimmen.
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
 * Pixelgröße des Zeichenpuffers: die größte 4:3-Fläche in der CSS-Box, mal
 * DPR, ganzzahlig und exakt 4:3 (Breite durch 4 teilbar), begrenzt auf `maxSize`.
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
