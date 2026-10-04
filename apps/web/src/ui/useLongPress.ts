import { type PointerEvent, type TouchEvent, useEffect, useRef } from "react";
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

/**
 * How far the finger may travel from the press origin and still be a tap on
 * release - the platform's tap slop, and a different threshold from
 * LONG_PRESS_TOLERANCE above (mmy-bmh). Conflating the two was the bug: at
 * 8 px the press stops being a *long* press, but it is still very much a tap,
 * and a thumb on a phone grid routinely covers 10 to 25 px between touchdown
 * and lift (measured on the Product Owner's device: 16 px vertically was
 * already enough to lose the pick entirely).
 *
 * 32 px is chosen as the separating value because it sits in the gap between
 * the two gestures rather than in the middle of either: an incidental thumb
 * roll stays under it (25 px was the worst case measured, and 32 px is about
 * the contact width of an adult thumb at this pixel density), while a
 * deliberate scroll of a grid whose rows are ~110 px tall covers several times
 * it - the flick in the regression test travels 140 px. Below the slop the
 * release picks, above it the gesture is a pan and the selection stays put.
 */
export const TAP_SLOP = 32;

/**
 * How far the view may move under the finger during a gesture whose pointer
 * the browser revoked, and still count as a tap (mmy-bmh). A separate
 * threshold from TAP_SLOP above, because it measures something else: not what
 * the finger did, but what the grid did. It catches the one pan TAP_SLOP
 * cannot see - the tap that arrests an ongoing fling, where the finger never
 * moves at all and only the view is in motion.
 *
 * The value has to clear the few pixels a tap of its own drags along once the
 * browser owns the gesture: a 25 px thumb roll on an already scrolled grid
 * moves it by about 10 px (measured). A fling being stopped moves it by far
 * more within the same press.
 */
export const TAP_SCROLL_SLOP = 32;

export interface LongPressHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  /**
   * Raw touch events of the same gesture. They are the only thing left once
   * the browser has taken the pointer away mid-gesture (`pointercancel`, see
   * `onPointerCancel`): touch events keep being delivered to the element the
   * gesture started on, scrolling or not, so they carry both the release and
   * the distance the finger really covered (mmy-bmh).
   */
  onTouchMove: (event: TouchEvent<HTMLElement>) => void;
  onTouchEnd: (event: TouchEvent<HTMLElement>) => void;
  /**
   * Wraps the tile's native `onClick`: a touch/pen gesture already handled
   * above (tap or long press) must not also run the native click that
   * follows it on real hardware - canceling the pointer events doesn't
   * reliably suppress it (mmy-edq), and a mouse click (which never reaches
   * onPointerDown above) always runs it.
   */
  guardClick: (onClick: () => void) => void;
}

interface Gesture {
  x: number;
  y: number;
  id: number;
  armed: boolean;
  /** Largest distance from the press origin seen so far, over the whole gesture. */
  moved: number;
  /** The browser took the pointer away; the touch stream now decides. */
  cancelled: boolean;
  /** Scroll container the press started in, and where it stood at that moment. */
  scroller: HTMLElement | null;
  scrollTop: number;
  scrollLeft: number;
}

const SCROLLS = new Set(["auto", "scroll", "overlay"]);

/** Nearest ancestor (including `el`) that really scrolls its overflow. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (SCROLLS.has(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    if (SCROLLS.has(style.overflowX) && node.scrollWidth > node.clientWidth) return node;
  }
  return null;
}

/** Records how far the finger is from the origin and returns that maximum. */
function track(s: Gesture, x: number, y: number): number {
  s.moved = Math.max(s.moved, Math.hypot(x - s.x, y - s.y));
  return s.moved;
}

/** How far the container the press started in has scrolled since. */
function scrolledBy(s: Gesture): number {
  if (!s.scroller) return 0;
  return Math.hypot(s.scroller.scrollTop - s.scrollTop, s.scroller.scrollLeft - s.scrollLeft);
}

function touchPoint(event: TouchEvent<HTMLElement>): { clientX: number; clientY: number } | null {
  return event.touches[0] ?? event.changedTouches[0] ?? null;
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
     * A touch/pen pointer released within TAP_SLOP of where it went down,
     * before `delay`: a plain tap. Takes over the gesture from the native
     * click, because on real hardware a tap's touchstart-to-touchend
     * duration or jitter can cross either threshold and otherwise race or
     * get silently dropped (mmy-edq, mmy-bmh). Only mouse pointers (ignored
     * above) keep using the native click, via the returned `guardClick`.
     */
    onTap?: () => void;
    /** Vibrate when armed; off where the touch drag start vibrates already. */
    haptic?: boolean;
  } = {},
): LongPressHandlers {
  const state = useRef<Gesture | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const callbacks = useRef({ onLongPress, onArmed, onDisarmed, onTap, haptic });
  callbacks.current = { onLongPress, onArmed, onDisarmed, onTap, haptic };

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  /** The press is no longer a candidate for the long press (it may still be a tap). */
  const disarm = (s: Gesture) => {
    clear();
    if (!s.armed) return;
    s.armed = false;
    callbacks.current.onDisarmed?.();
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
      const scroller = scrollParent(event.currentTarget);
      state.current = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
        armed: false,
        moved: 0,
        cancelled: false,
        scroller,
        scrollTop: scroller?.scrollTop ?? 0,
        scrollLeft: scroller?.scrollLeft ?? 0,
      };
      timer.current = setTimeout(() => {
        if (!state.current) return;
        state.current.armed = true;
        if (callbacks.current.haptic) vibrate("activate");
        callbacks.current.onArmed?.();
      }, delay);
    },
    onPointerMove(event) {
      const s = state.current;
      if (!s || s.cancelled || s.id !== event.pointerId) return;
      // Past LONG_PRESS_TOLERANCE the press is not a hold any more - but the
      // gesture lives on, because within TAP_SLOP it is still a tap (mmy-bmh).
      if (track(s, event.clientX, event.clientY) > LONG_PRESS_TOLERANCE) disarm(s);
    },
    onPointerUp(event) {
      const s = state.current;
      clear();
      state.current = null;
      if (!s || s.id !== event.pointerId) {
        if (s?.armed) callbacks.current.onDisarmed?.();
        return;
      }
      const armed = s.armed;
      if (armed) callbacks.current.onDisarmed?.();
      const moved = track(s, event.clientX, event.clientY);
      if (!armed && moved > TAP_SLOP) return; // a drag, not a tap: nothing to do
      // The native click that follows on real hardware must not also fire:
      // guardClick() below swallows it. Only set when the gesture was handled
      // here, so a later mouse click is never swallowed instead.
      suppressClick.current = true;
      if (armed) callbacks.current.onLongPress();
      else callbacks.current.onTap?.();
    },
    onPointerCancel(event) {
      const s = state.current;
      if (!s) {
        clear();
        return;
      }
      const armed = s.armed;
      disarm(s);
      // mmy-bmh: Chrome revokes the pointer the moment it decides the touch
      // *may* pan - after barely more than its own 8 px scroll slop, and with
      // no pointerup and no click to follow. At that instant a drifting thumb
      // and the first millimetres of a real scroll are indistinguishable, so
      // deciding here means either losing every drifting tap (what shipped) or
      // picking on every scroll. The raw touch events of the same gesture keep
      // arriving (measured), so the decision waits for touchend below. An
      // armed hold is not carried over: a hold that the browser turns into a
      // pan stays a pan.
      if (armed || event.pointerType !== "touch" || s.moved > TAP_SLOP) {
        state.current = null;
        return;
      }
      s.cancelled = true;
    },
    onTouchMove(event) {
      const s = state.current;
      if (!s?.cancelled) return;
      const point = touchPoint(event);
      if (point) track(s, point.clientX, point.clientY);
    },
    onTouchEnd(event) {
      const s = state.current;
      if (!s?.cancelled) return;
      clear();
      state.current = null;
      const point = touchPoint(event);
      const moved = point ? track(s, point.clientX, point.clientY) : s.moved;
      // A pan is a pan whether it is measured in pixels of finger travel or in
      // the scrolling it caused - the second test catches the tap that arrests
      // an ongoing fling, where the finger never moves at all.
      if (moved > TAP_SLOP || scrolledBy(s) > TAP_SCROLL_SLOP) return;
      // No native click follows a revoked pointer, so suppressClick stays off.
      callbacks.current.onTap?.();
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
