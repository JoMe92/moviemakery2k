import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOLD_MS,
  LONG_PRESS_TOLERANCE,
  TAP_SCROLL_SLOP,
  TAP_SLOP,
  useLongPress,
} from "./useLongPress";

/**
 * The three axes of this gesture (mmy-bmh): a tap is lost if any one of them
 * is read wrongly, and each of the three shipped fixes so far addressed only
 * one. Duration is mmy-43e, the missing native click is mmy-edq, and the
 * finger's DRIFT is this one - the previous two both shipped tests that tap
 * without moving, which is why 16 px of thumb roll survived them.
 */

const ID = 7;
const ORIGIN = { pointerId: ID, pointerType: "touch", clientX: 100, clientY: 100 };

const counters = { tap: 0, longPress: 0, click: 0 };

function Harness({ scroller }: { scroller?: boolean }) {
  const handlers = useLongPress(
    () => {
      counters.longPress += 1;
    },
    {
      delay: HOLD_MS,
      onTap: () => {
        counters.tap += 1;
      },
      haptic: false,
    },
  );
  const tile = (
    <button
      type="button"
      data-testid="tile"
      onPointerDown={handlers.onPointerDown}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerCancel}
      onTouchMove={handlers.onTouchMove}
      onTouchEnd={handlers.onTouchEnd}
      onClick={() =>
        handlers.guardClick(() => {
          counters.click += 1;
        })
      }
    >
      tile
    </button>
  );
  if (!scroller) return tile;
  return (
    <div data-testid="scroller" style={{ overflowY: "auto" }}>
      {tile}
    </div>
  );
}

const tile = () => screen.getByTestId("tile");

/** Makes the wrapper a real scroll container; jsdom has no layout. */
function makeScrollable() {
  const el = screen.getByTestId("scroller");
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: 2000 });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: 500 });
  return el;
}

/** touchstart -> touchmoves -> touchend, as the browser delivers a finger. */
function press(
  el: HTMLElement,
  {
    dx = 0,
    dy = 0,
    hold = 150,
    steps = 4,
    /** The browser revokes the pointer mid-gesture, as Chrome does past ~16 px. */
    cancelAfter,
    /** Scrolls the container by this much while the finger is down. */
    scrollBy = 0,
  }: {
    dx?: number;
    dy?: number;
    hold?: number;
    steps?: number;
    cancelAfter?: number;
    scrollBy?: number;
  } = {},
) {
  const at = (k: number) => ({
    ...ORIGIN,
    clientX: ORIGIN.clientX + (dx * k) / steps,
    clientY: ORIGIN.clientY + (dy * k) / steps,
  });
  const touches = (k: number) => {
    const { clientX, clientY } = at(k);
    return { touches: [{ clientX, clientY }], changedTouches: [{ clientX, clientY }] };
  };
  fireEvent.pointerDown(el, ORIGIN);
  let cancelled = false;
  for (let k = 1; k <= steps; k += 1) {
    act(() => vi.advanceTimersByTime(hold / steps));
    if (
      cancelAfter !== undefined &&
      !cancelled &&
      Math.hypot(dx, dy) * (k / steps) >= cancelAfter
    ) {
      fireEvent.pointerCancel(el, ORIGIN);
      cancelled = true;
    }
    if (cancelled) fireEvent.touchMove(el, touches(k));
    else fireEvent.pointerMove(el, at(k));
  }
  if (scrollBy) {
    const scroller = screen.getByTestId("scroller");
    scroller.scrollTop += scrollBy;
    fireEvent.scroll(scroller);
  }
  if (cancelled) fireEvent.touchEnd(el, { ...touches(steps), touches: [] });
  else fireEvent.pointerUp(el, at(steps));
}

beforeEach(() => {
  counters.tap = 0;
  counters.longPress = 0;
  counters.click = 0;
  vi.useFakeTimers();
  return () => vi.useRealTimers();
});

describe("useLongPress", () => {
  // The drift sweep. Every one of these is one human thumb tap.
  describe.each([
    ["horizontal", (d: number) => ({ dx: d })],
    ["vertical", (d: number) => ({ dy: d })],
    ["diagonal", (d: number) => ({ dx: d / Math.SQRT2, dy: d / Math.SQRT2 })],
  ])("a tap that drifts %s", (_axis, move) => {
    it.each([0, 4, LONG_PRESS_TOLERANCE, 10, 16, 20, 25, TAP_SLOP])(
      "picks at %i px of drift",
      (drift) => {
        render(<Harness />);
        press(tile(), move(drift));
        expect(counters.tap).toBe(1);
        expect(counters.longPress).toBe(0);
      },
    );

    // Past 8 px Chrome revokes the pointer: no pointerup and no click follow,
    // so the release can only be read from the raw touch stream (mmy-bmh).
    it.each([16, 20, 25, TAP_SLOP])("picks at %i px of drift with a revoked pointer", (drift) => {
      render(<Harness />);
      press(tile(), { ...move(drift), cancelAfter: LONG_PRESS_TOLERANCE });
      expect(counters.tap).toBe(1);
      expect(counters.longPress).toBe(0);
    });

    it.each([TAP_SLOP + 2, 60, 140])("does not pick at %i px: that is a pan", (drift) => {
      render(<Harness />);
      press(tile(), { ...move(drift), cancelAfter: LONG_PRESS_TOLERANCE });
      expect(counters.tap).toBe(0);
      expect(counters.longPress).toBe(0);
    });
  });

  // The duration sweep of mmy-43e, kept here next to the drift sweep so no
  // later fix can satisfy one axis and silently drop the other.
  it.each([120, 300, 450, 700, HOLD_MS - 1])("picks on a %i ms tap", (hold) => {
    render(<Harness />);
    press(tile(), { hold, dy: 6 });
    expect(counters.tap).toBe(1);
    expect(counters.longPress).toBe(0);
  });

  it("swallows the native click that follows a tap it handled (mmy-edq)", () => {
    render(<Harness />);
    press(tile());
    fireEvent.click(tile());
    expect(counters.tap).toBe(1);
    expect(counters.click).toBe(0);
  });

  it("leaves a mouse click to the native click", () => {
    render(<Harness />);
    fireEvent.pointerDown(tile(), { pointerId: 1, pointerType: "mouse", button: 0 });
    fireEvent.pointerUp(tile(), { pointerId: 1, pointerType: "mouse", button: 0 });
    fireEvent.click(tile());
    expect(counters.tap).toBe(0);
    expect(counters.click).toBe(1);
  });

  it("does not swallow a click when it handled nothing", () => {
    render(<Harness />);
    press(tile(), { dy: 140, cancelAfter: LONG_PRESS_TOLERANCE });
    fireEvent.click(tile());
    expect(counters.tap).toBe(0);
    expect(counters.click).toBe(1);
  });

  it("opens the long press on an unmistakable hold", () => {
    render(<Harness />);
    press(tile(), { hold: HOLD_MS + 200, steps: 1 });
    expect(counters.longPress).toBe(1);
    expect(counters.tap).toBe(0);
  });

  it("keeps a hold that drifts out of its tolerance from opening the menu", () => {
    render(<Harness />);
    press(tile(), { hold: HOLD_MS + 200, dy: 140 });
    expect(counters.longPress).toBe(0);
    expect(counters.tap).toBe(0);
  });

  it("does not revive an armed hold whose pointer the browser revoked", () => {
    render(<Harness />);
    fireEvent.pointerDown(tile(), ORIGIN);
    act(() => vi.advanceTimersByTime(HOLD_MS));
    fireEvent.pointerCancel(tile(), ORIGIN);
    fireEvent.touchEnd(tile(), {
      touches: [],
      changedTouches: [{ clientX: ORIGIN.clientX, clientY: ORIGIN.clientY }],
    });
    expect(counters.longPress).toBe(0);
    expect(counters.tap).toBe(0);
  });

  describe("on a grid that scrolls", () => {
    it("picks a drifting tap that only nudges the grid", () => {
      render(<Harness scroller />);
      makeScrollable();
      press(tile(), { dy: 25, cancelAfter: LONG_PRESS_TOLERANCE, scrollBy: 10 });
      expect(counters.tap).toBe(1);
    });

    // The pan TAP_SLOP cannot see: the finger holds still and the view moves.
    it("does not pick when the finger arrests a moving grid", () => {
      render(<Harness scroller />);
      makeScrollable();
      press(tile(), { cancelAfter: 0, steps: 2, scrollBy: TAP_SCROLL_SLOP + 20 });
      expect(counters.tap).toBe(0);
    });
  });
});
