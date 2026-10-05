import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MusicClip, Slide } from "../lib/apiClient";
import { audioItem, mediaItem, mockApi } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";
import { HOLD_MS, LONG_PRESS_TOLERANCE, TAP_SLOP } from "../ui/useLongPress";

/**
 * Tap selects, hold opens the action sheet - on a filmstrip picture and on a
 * music clip (add-mobile-layout design.md D6, mmy-c4r).
 *
 * The same release ambiguity the collection sheet was fixed for three times
 * over, in the two places that were left out of those Beads: a deliberate
 * finger tap on a phone lasts 400 to 700 ms and drifts 10 to 25 px, and either
 * of those used to turn it into a long press, so the element's menu opened
 * instead of the element being selected. Nothing looked broken, which is why it
 * survived - so this file sweeps both axes of a real finger, in both places,
 * the way `CollectionSheet.test.tsx` does for picking.
 */

const TOUCH = { pointerId: 3, pointerType: "touch", clientX: 50, clientY: 50 };

/**
 * A touch press held `ms` and released, the way a finger does it - `user.click()`
 * is instantaneous and cannot tell a tap from a hold (mmy-43e).
 */
function holdPress(el: HTMLElement, ms: number) {
  vi.useFakeTimers();
  try {
    fireEvent.pointerDown(el, TOUCH);
    act(() => vi.advanceTimersByTime(ms));
    fireEvent.pointerUp(el, TOUCH);
  } finally {
    vi.useRealTimers();
  }
}

/**
 * A thumb tap that drifts `drift` px along `axis` before lifting (mmy-bmh).
 * Past LONG_PRESS_TOLERANCE Chrome stops sending pointer events for the
 * gesture and revokes the pointer instead (measured), so the release arrives as
 * a plain touchend - the element has to be selected on that too.
 */
function driftPress(el: HTMLElement, drift: number, axis: "x" | "y") {
  const at = (d: number) => ({
    ...TOUCH,
    clientX: TOUCH.clientX + (axis === "x" ? d : 0),
    clientY: TOUCH.clientY + (axis === "y" ? d : 0),
  });
  const point = (d: number) => ({ clientX: at(d).clientX, clientY: at(d).clientY });
  vi.useFakeTimers();
  try {
    fireEvent.pointerDown(el, TOUCH);
    const revoked = drift > LONG_PRESS_TOLERANCE;
    for (let k = 1; k <= 4; k += 1) {
      act(() => vi.advanceTimersByTime(40));
      const d = (drift * k) / 4;
      if (revoked && d > LONG_PRESS_TOLERANCE) {
        if (d - drift / 4 <= LONG_PRESS_TOLERANCE) fireEvent.pointerCancel(el, TOUCH);
        fireEvent.touchMove(el, { touches: [point(d)], changedTouches: [point(d)] });
      } else {
        fireEvent.pointerMove(el, at(d));
      }
    }
    if (revoked) fireEvent.touchEnd(el, { touches: [], changedTouches: [point(drift)] });
    else fireEvent.pointerUp(el, at(drift));
  } finally {
    vi.useRealTimers();
  }
}

const slide = (id: string, mediaId: string): Slide => ({
  kind: "image",
  id,
  mediaId,
  duration: 3,
  effectId: null,
  title: null,
  transitionIn: null,
});

const clip = (id: string, mediaId: string): MusicClip => ({
  id,
  mediaId,
  trimStart: 0,
  trimEnd: null,
  volume: 1,
  fadeIn: false,
  fadeOut: false,
});

async function setup() {
  mockLayout("compact", { coarse: true });
  const api = mockApi({
    listMedia: async () => [mediaItem("a"), mediaItem("b"), audioItem("x", 50), audioItem("y", 50)],
    getProject: vi.fn(async () => ({
      schemaVersion: 6 as const,
      narration: [],
      clipAudioBalance: 50,
      slides: [slide("s1", "a"), slide("s2", "b")],
      music: [clip("m1", "x"), clip("m2", "y")],
    })),
  });
  const view = renderApp(api);
  await act(() => view.ready);
  return view;
}

type Store = Awaited<ReturnType<typeof setup>>["store"];

/** The two places this Bead is about, each with its own store state and menu. */
interface Target {
  /** Second element of its list - so a reorder would be visible either way. */
  el: () => HTMLElement;
  /** What the store holds once a tap has selected it. */
  selection: (store: Store) => unknown;
  selected: unknown;
  /** No selection at all (a pan must leave it here). */
  none: unknown;
  menu: string;
  items: string[];
  /** The list after the menu's "Entfernen" has run. */
  removed: (store: Store) => string[];
  rest: string[];
}

const PICTURE: Target = {
  el: () => screen.getByRole("button", { name: /^Bild 2:/ }),
  selection: (store) => store.getState().selection,
  selected: { kind: "slide", slideId: "s2" },
  none: null,
  menu: "Bild 2 des Storyboards",
  items: ["Entfernen", "Keinen Effekt", "Eigenschaften…"],
  removed: (store) => store.getState().slides.map((s) => s.id),
  rest: ["s1"],
};

const CLIP: Target = {
  el: () => screen.getByRole("button", { name: /^Musikstück 2:/ }),
  selection: (store) => store.getState().musicSelection,
  selected: "m2",
  none: null,
  menu: "Musikstück 2 der Musikleiste",
  items: ["Entfernen", "Lautstärke…", "Kürzen…"],
  removed: (store) => store.getState().music.map((c) => c.id),
  rest: ["m1"],
};

describe.each([
  ["a filmstrip picture", PICTURE],
  ["a music clip", CLIP],
])("tap and hold on %s (design.md D6)", (_what, target) => {
  // mmy-c4r: every one of these durations used to be read as a long press on
  // release from 400 ms on, so the element's menu opened instead of selecting
  // it - and because the menu's first entries are useful ones, nothing looked
  // broken and the user blamed themselves.
  it.each([120, 300, 450, 700, HOLD_MS - 1])("selects it on a %i ms tap", async (ms) => {
    const { store } = await setup();
    const el = target.el();
    holdPress(el, ms);
    expect(el).toHaveAttribute("aria-pressed", "true");
    expect(target.selection(store)).toEqual(target.selected);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  // mmy-bmh, the other axis of the same gesture: a thumb does not land and lift
  // on one pixel, and past ~16 px Chrome revokes the pointer and sends no click
  // at all - so only the touch stream can still decide the tap.
  describe.each([
    ["horizontally", "x" as const],
    ["vertically", "y" as const],
  ])("a tap that drifts %s", (_axis, axis) => {
    it.each([0, LONG_PRESS_TOLERANCE, 10, 12, 16, 20, 25, TAP_SLOP])(
      "selects it at %i px of drift",
      async (drift) => {
        const { store } = await setup();
        const el = target.el();
        driftPress(el, drift, axis);
        expect(el).toHaveAttribute("aria-pressed", "true");
        expect(target.selection(store)).toEqual(target.selected);
        expect(screen.queryByRole("menu")).toBeNull();
      },
    );

    it.each([TAP_SLOP + 2, 140])("leaves the selection alone at %i px: a pan", async (drift) => {
      const { store } = await setup();
      const el = target.el();
      driftPress(el, drift, axis);
      expect(el).toHaveAttribute("aria-pressed", "false");
      expect(target.selection(store)).toEqual(target.none);
      expect(screen.queryByRole("menu")).toBeNull();
    });
  });

  it("announces the armed hold before the finger lifts", async () => {
    await setup();
    const el = target.el();
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(el, TOUCH);
      act(() => vi.advanceTimersByTime(HOLD_MS - 1));
      expect(el).not.toHaveAttribute("data-armed");
      act(() => vi.advanceTimersByTime(1));
      // Armed, but nothing decided yet: the finger is still down.
      expect(el).toHaveAttribute("data-armed", "true");
      expect(screen.queryByRole("menu")).toBeNull();
      fireEvent.pointerUp(el, TOUCH);
    } finally {
      vi.useRealTimers();
    }
    expect(screen.getByRole("menu", { name: target.menu })).toBeInTheDocument();
    expect(el).not.toHaveAttribute("data-armed");
  });

  it("opens the action sheet on a real hold, and its entries work", async () => {
    const user = userEvent.setup();
    const { store } = await setup();
    holdPress(target.el(), HOLD_MS);
    const menu = screen.getByRole("menu", { name: target.menu });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(target.items);
    await user.click(within(menu).getByRole("menuitem", { name: "Entfernen" }));
    expect(target.removed(store)).toEqual(target.rest);
  });

  it("drags out of an armed hold without opening the action sheet", async () => {
    await setup();
    const el = target.el();
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(el, TOUCH);
      act(() => vi.advanceTimersByTime(HOLD_MS));
      expect(el).toHaveAttribute("data-armed", "true");
      // Well past TAP_SLOP: this is the reorder drag, not a tap that drifted.
      fireEvent.pointerMove(el, { ...TOUCH, clientX: TOUCH.clientX + 4 * TAP_SLOP });
      expect(el).not.toHaveAttribute("data-armed");
      fireEvent.pointerUp(el, { ...TOUCH, clientX: TOUCH.clientX + 4 * TAP_SLOP });
    } finally {
      vi.useRealTimers();
    }
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

it("opens a picture's properties from the held press", async () => {
  const user = userEvent.setup();
  await setup();
  holdPress(PICTURE.el(), HOLD_MS);
  const menu = screen.getByRole("menu", { name: PICTURE.menu });
  await user.click(within(menu).getByRole("menuitem", { name: "Eigenschaften…" }));
  expect(screen.getByRole("dialog", { name: "Eigenschaften von Bild 2" })).toBeInTheDocument();
});

it("opens a music clip's volume dialog from the held press", async () => {
  const user = userEvent.setup();
  await setup();
  holdPress(CLIP.el(), HOLD_MS);
  const menu = screen.getByRole("menu", { name: CLIP.menu });
  await user.click(within(menu).getByRole("menuitem", { name: "Lautstärke…" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
