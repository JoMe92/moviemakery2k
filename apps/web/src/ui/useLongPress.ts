import { type PointerEvent, useEffect, useRef } from "react";
import { vibrate } from "./haptics";

/** Long press (add-mobile-layout design.md D6): 400 ms without moving more than 8 px. */
export const LONG_PRESS_MS = 400;
export const LONG_PRESS_TOLERANCE = 8;

/**
 * Long press where a plain press has its own meaning and the press itself is
 * the primary action - the collection sheet, where a tap picks the tile
 * (design.md D7). A deliberate finger tap on a phone routinely lasts 400 to
 * 700 ms (measured, mmy-43e), so at LONG_PRESS_MS such a tap was classified as
 * a long press on release: it opened the tile's action sheet instead of picking
 * the tile, and the storyboard stayed empty. Here the press must be an
 * unmistakable hold, well past the longest deliberate tap, and the hook
 * announces the arm (`onArmed`/`onDisarmed`) so the user sees what the release
 * will do before lifting the finger.
 */
export const HOLD_MS = 1000;

export interface LongPressHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  /**
   * Wraps the tile's native `onClick`: a touch/pen gesture already handled
   * above (tap or long press) must not also run the native click that
   * follows it on real hardware - canceling the pointer events doesn't
   * reliably suppress it (mmy-edq), and a mouse click (which never reaches
   * onPointerDown above) always runs it.
   */
  guardClick: (onClick: () => void) => void;
}

/**
 * Detects a long press of a touch or pen pointer (the mouse has its right
 * click). The callback runs when the finger is lifted after at least `delay`
 * ms without moving more than 8 px; a press that turns into a drag (movement
 * after the delay) or a cancel does nothing, so long press + drag stays free
 * for reordering. `onArmed`/`onDisarmed` bracket the time in which the release
 * would run `onLongPress` instead of `onTap`, so a caller whose tap has its
 * own meaning can make that visible while the finger is still down.
 */
export function useLongPress(
  onLongPress: () => void,
  {
    enabled = true,
    delay = LONG_PRESS_MS,
    onArmed,
    onDisarmed,
    onTap,
    haptic = true,
  }: {
    enabled?: boolean;
    /** Hold needed for the long press; HOLD_MS where a tap means something. */
    delay?: number;
    onArmed?: () => void;
    /**
     * An armed press ended (released, cancelled or turned into a drag): the
     * counterpart of `onArmed` for a caller that shows the armed state.
     */
    onDisarmed?: () => void;
    /**
     * A touch/pen pointer released before `delay` without exceeding
     * LONG_PRESS_TOLERANCE: a plain tap. Takes over the gesture from the
     * native click, because on real hardware a tap's touchstart-to-touchend
     * duration or jitter can cross either threshold and otherwise race or
     * get silently dropped (mmy-edq). Only mouse pointers (ignored above)
     * keep using the native click, via the returned `guardClick`.
     */
    onTap?: () => void;
    /** Vibrate when armed; off where the touch drag start vibrates already. */
    haptic?: boolean;
  } = {},
): LongPressHandlers {
  const state = useRef<{ x: number; y: number; id: number; armed: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const callbacks = useRef({ onLongPress, onArmed, onDisarmed, onTap, haptic });
  callbacks.current = { onLongPress, onArmed, onDisarmed, onTap, haptic };

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
      }, delay);
    },
    onPointerMove(event) {
      const s = state.current;
      if (!s || s.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - s.x, event.clientY - s.y) > LONG_PRESS_TOLERANCE) {
        clear();
        state.current = null;
        if (s.armed) callbacks.current.onDisarmed?.();
      }
    },
    onPointerUp(event) {
      const s = state.current;
      clear();
      state.current = null;
      if (s?.armed) callbacks.current.onDisarmed?.();
      if (!s || s.id !== event.pointerId) return;
      // The native click that follows on real hardware must not also fire:
      // guardClick() below swallows it.
      suppressClick.current = true;
      if (s.armed) callbacks.current.onLongPress();
      else callbacks.current.onTap?.();
    },
    onPointerCancel() {
      const s = state.current;
      clear();
      state.current = null;
      if (s?.armed) callbacks.current.onDisarmed?.();
    },
    guardClick(onClick) {
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      onClick();
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
