import { type PointerEvent, useEffect, useRef } from "react";
import { vibrate } from "./haptics";

/** Long press (add-mobile-layout design.md D6): 400 ms without moving more than 8 px. */
export const LONG_PRESS_MS = 400;
export const LONG_PRESS_TOLERANCE = 8;

export interface LongPressHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
}

/**
 * Detects a long press of a touch or pen pointer (the mouse has its right
 * click). The callback runs when the finger is lifted after at least 400 ms
 * without moving more than 8 px; a press that turns into a drag (movement
 * after the delay) or a cancel does nothing, so long press + drag stays free
 * for reordering.
 */
export function useLongPress(
  onLongPress: () => void,
  {
    enabled = true,
    onArmed,
    haptic = true,
  }: {
    enabled?: boolean;
    onArmed?: () => void;
    /** Vibrate when armed; off where the touch drag start vibrates already. */
    haptic?: boolean;
  } = {},
): LongPressHandlers {
  const state = useRef<{ x: number; y: number; id: number; armed: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onLongPress, onArmed, haptic });
  callbacks.current = { onLongPress, onArmed, haptic };

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return {
    onPointerDown(event) {
      if (!enabled || event.pointerType === "mouse" || event.button > 0) return;
      clear();
      state.current = { x: event.clientX, y: event.clientY, id: event.pointerId, armed: false };
      timer.current = setTimeout(() => {
        if (!state.current) return;
        state.current.armed = true;
        if (callbacks.current.haptic) vibrate("activate");
        callbacks.current.onArmed?.();
      }, LONG_PRESS_MS);
    },
    onPointerMove(event) {
      const s = state.current;
      if (!s || s.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - s.x, event.clientY - s.y) > LONG_PRESS_TOLERANCE) {
        clear();
        state.current = null;
      }
    },
    onPointerUp(event) {
      const s = state.current;
      clear();
      state.current = null;
      if (s?.armed && s.id === event.pointerId) callbacks.current.onLongPress();
    },
    onPointerCancel() {
      clear();
      state.current = null;
    },
  };
}

type Handler<E> = ((event: E) => void) | undefined;

/** Calls both handlers in order (e.g. dnd-kit listeners and long press). */
export function chain<E>(first: Handler<E>, second: Handler<E>): (event: E) => void {
  return (event) => {
    first?.(event);
    second?.(event);
  };
}
