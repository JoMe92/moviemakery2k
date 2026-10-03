import { type PointerEvent, useRef } from "react";

/** Distance ratio between two fingers that counts as one zoom step. */
export const PINCH_STEP = 1.3;

/**
 * Two-finger pinch from Pointer Events (add-mobile-layout design.md D12):
 * spreading by 30 % calls onZoomIn, pinching by the same onZoomOut; each
 * step re-bases, so a long gesture can step more than once.
 */
export function usePinch(onZoomIn: () => void, onZoomOut: () => void, enabled = true) {
  const points = useRef(new Map<number, { x: number; y: number }>());
  const base = useRef<number | null>(null);

  const distance = () => {
    const [a, b] = [...points.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    points.current.delete(event.pointerId);
    if (points.current.size < 2) base.current = null;
  };

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!enabled || event.pointerType !== "touch") return;
      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (points.current.size === 2) base.current = distance();
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!points.current.has(event.pointerId)) return;
      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const d = distance();
      if (d === null || base.current === null || base.current <= 0) return;
      if (d / base.current >= PINCH_STEP) {
        base.current = d;
        onZoomIn();
      } else if (base.current / d >= PINCH_STEP) {
        base.current = d;
        onZoomOut();
      }
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
}
