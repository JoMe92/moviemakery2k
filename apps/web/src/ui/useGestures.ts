import { type PointerEvent, useEffect, useRef } from "react";

/** Swipe threshold (px) and dominance of the horizontal part (design.md D12). */
export const SWIPE_DISTANCE = 48;
/** Two taps within this time (ms) and distance (px) are a double tap. */
export const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DISTANCE = 24;
/** A tap moves less than this (px). */
const TAP_SLOP = 10;

export interface GestureCallbacks {
  /** Finger moved left by at least 48 px, mostly horizontally. */
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onDoubleTap?: () => void;
  /** Any touch of the area (e.g. to show hidden controls again). */
  onActivity?: () => void;
}

/**
 * Swipe and double tap from Pointer Events, without a new dependency
 * (add-mobile-layout design.md D12). Only touch and pen pointers count; the
 * mouse keeps its buttons.
 */
export function useGestures(callbacks: GestureCallbacks, enabled = true) {
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const lastTap = useRef<{ x: number; y: number; time: number } | null>(null);
  useEffect(() => {
    if (!enabled) {
      start.current = null;
      lastTap.current = null;
    }
  }, [enabled]);

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!enabled || event.pointerType === "mouse") return;
      latest.current.onActivity?.();
      start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const s = start.current;
      start.current = null;
      if (!enabled || !s || s.id !== event.pointerId) return;
      const dx = event.clientX - s.x;
      const dy = event.clientY - s.y;
      if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) {
        lastTap.current = null;
        if (dx < 0) latest.current.onSwipeLeft?.();
        else latest.current.onSwipeRight?.();
        return;
      }
      if (Math.hypot(dx, dy) >= TAP_SLOP) return;
      const now = performance.now();
      const prev = lastTap.current;
      if (
        prev &&
        now - prev.time <= DOUBLE_TAP_MS &&
        Math.hypot(event.clientX - prev.x, event.clientY - prev.y) <= DOUBLE_TAP_DISTANCE
      ) {
        lastTap.current = null;
        latest.current.onDoubleTap?.();
        return;
      }
      lastTap.current = { x: event.clientX, y: event.clientY, time: now };
    },
    onPointerCancel() {
      start.current = null;
    },
  };
}
