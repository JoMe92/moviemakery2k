import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicClip, Slide } from "../lib/apiClient";
import { slideMediaId } from "../store/projectOps";
import { audioItem, mediaItem, mockApi, slideMediaIdOf } from "../store/testApi";
import { AppStoreContext } from "../store/useAppStore";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";
import { setVibrationEnabled } from "../ui/haptics";
import { useAddFromCollection } from "./useAddFromCollection";

/*
 * Confirming an add from the collection (app-shell design.md D6): the short
 * notice with count and kind, the last added element scrolled into view, the
 * selection left alone and the short vibration. All three ways are checked -
 * the collection sheet's button, a double-click on a tile and its context
 * menu.
 */

const slide = (id: string, mediaId: string): Slide => ({
  kind: "image",
  id,
  mediaId,
  duration: 5,
  title: null,
  transitionIn: null,
  effectId: null,
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

/** jsdom has no scrollIntoView; record who was asked to scroll. */
let scrolled: HTMLElement[] = [];
beforeEach(() => {
  scrolled = [];
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: function (this: HTMLElement) {
      scrolled.push(this);
    },
  });
});
afterEach(() => {
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  Reflect.deleteProperty(navigator, "vibrate");
});

function withVibrate() {
  const fn = vi.fn(() => true);
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: fn });
  return fn;
}

const PICTURES = [mediaItem("a"), mediaItem("b"), mediaItem("c")];
const MUSIC = [audioItem("m1"), audioItem("m2")];

function api(slides: Slide[] = [], music: MusicClip[] = []) {
  return mockApi({
    listMedia: vi.fn(async () => [...PICTURES, ...MUSIC]),
    getProject: vi.fn(async () => ({
      schemaVersion: 6 as const,
      narration: [],
      clipAudioBalance: 50,
      slides,
      music,
    })),
  });
}

async function setup(mode: "wide" | "compact", slides: Slide[] = [], music: MusicClip[] = []) {
  mockLayout(mode);
  const view = renderApp(api(slides, music));
  await act(() => view.ready);
  return { ...view, user: userEvent.setup() };
}

/** The visible short notice, whichever surface the layout uses. */
function notice(): string {
  const strip = screen
    .getAllByRole("status")
    .find((el) => el.tagName === "DIV" && el.getAttribute("aria-live") === "polite");
  const bar = screen.queryByRole("contentinfo");
  const fromBar = bar
    ? (within(bar)
        .getAllByRole("status")
        .map((el) => el.textContent ?? "")
        .find((text) => /hinzugefügt|added/.test(text)) ?? "")
    : "";
  return fromBar || (strip?.textContent ?? "");
}

/** Calls the helper straight, for cases no UI path can produce. */
function Harness({ ids }: { ids: string[] }) {
  const { addToStoryboard } = useAddFromCollection();
  return (
    <button type="button" onClick={() => addToStoryboard(ids)}>
      add
    </button>
  );
}

const tile = (name: string | RegExp) =>
  within(screen.getByRole("region", { name: /^(Sammlung|Collection)/ })).getByRole("button", {
    name,
  });

describe("confirming an add from the collection", () => {
  it("reports three pictures from the sheet's button, scrolls the last one and vibrates", async () => {
    const vibrate = withVibrate();
    const { user, store } = await setup("compact");
    act(() => store.getState().setCollectionSheetOpen(true));
    const sheet = screen.getByRole("dialog", { name: "Sammlungen" });
    const pictures = within(sheet).getByRole("list", { name: "Bilder" });
    for (const name of ["c.jpg", "a.jpg", "b.jpg"]) {
      await user.click(within(pictures).getByRole("button", { name }));
    }

    await user.click(
      within(sheet).getByRole("button", { name: "Zum Bildstreifen hinzufügen (3)" }),
    );

    expect(store.getState().slides.map((s) => slideMediaId(s))).toEqual(["c", "a", "b"]);
    expect(notice()).toBe("3 Bilder hinzugefügt");
    // The picture added last is the one brought into view.
    const last = store.getState().slides.at(-1);
    await waitFor(() =>
      expect(scrolled.some((el) => el.getAttribute("aria-label")?.startsWith("Bild 3:"))).toBe(
        true,
      ),
    );
    expect(slideMediaIdOf(last)).toBe("b");
    expect(vibrate).toHaveBeenCalledWith(15);
  });

  it("reports one picture per double-click and leaves the selection alone", async () => {
    const { user, store } = await setup("wide", [slide("s1", "a")]);
    act(() => store.getState().select({ kind: "slide", slideId: "s1" }));

    await user.dblClick(tile("b.jpg"));

    expect(store.getState().slides.map((s) => slideMediaId(s))).toEqual(["a", "b"]);
    expect(notice()).toBe("1 Bild hinzugefügt");
    // The insertion point for the next add stays where the user put it.
    expect(store.getState().selection).toEqual({ kind: "slide", slideId: "s1" });
  });

  it("reports one music clip from the context menu and scrolls it into view", async () => {
    const { user, store } = await setup("wide", [], [clip("c1", "m1")]);
    act(() => store.getState().setCollection("music"));

    fireEvent.contextMenu(tile(/^m2\.mp3/));
    await user.click(screen.getByRole("menuitem", { name: "Zur Musikleiste hinzufügen" }));

    expect(store.getState().music.map((c) => c.mediaId)).toEqual(["m1", "m2"]);
    expect(notice()).toBe("1 Musikstück hinzugefügt");
    const added = store.getState().music.at(-1);
    await waitFor(() =>
      expect(scrolled.some((el) => el.getAttribute("aria-label")?.includes("m2.mp3"))).toBe(true),
    );
    expect(added?.mediaId).toBe("m2");
  });

  it("uses the English plural forms", async () => {
    const { user, store } = await setup("wide");
    act(() => store.getState().setLocale("en"));

    await user.dblClick(tile("a.jpg"));
    expect(notice()).toBe("1 picture added");

    act(() => store.getState().setCollection("music"));
    await user.dblClick(tile(/^m1\.mp3/));
    expect(notice()).toBe("1 music clip added");
  });

  it("counts the plural in the sheet: two pictures, one picture", async () => {
    const { user, store } = await setup("compact");
    act(() => store.getState().setCollectionSheetOpen(true));
    const pictures = () =>
      within(screen.getByRole("dialog", { name: "Sammlungen" })).getByRole("list", {
        name: "Bilder",
      });
    const addButton = (count: number) =>
      screen.getByRole("button", { name: `Zum Bildstreifen hinzufügen (${count})` });

    await user.click(within(pictures()).getByRole("button", { name: "a.jpg" }));
    await user.click(within(pictures()).getByRole("button", { name: "b.jpg" }));
    await user.click(addButton(2));
    expect(notice()).toBe("2 Bilder hinzugefügt");

    act(() => store.getState().setCollectionSheetOpen(true));
    await user.click(within(pictures()).getByRole("button", { name: "c.jpg" }));
    await user.click(addButton(1));
    expect(notice()).toBe("1 Bild hinzugefügt");
  });

  it("does not vibrate while the switch is off, and still confirms", async () => {
    const vibrate = withVibrate();
    setVibrationEnabled(false);
    const { user, store } = await setup("wide");

    await user.dblClick(tile("a.jpg"));

    expect(store.getState().slides).toHaveLength(1);
    expect(notice()).toBe("1 Bild hinzugefügt");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("confirms on a device without the Vibration API", async () => {
    const { user, store } = await setup("wide");
    expect(navigator.vibrate).toBeUndefined();

    await user.dblClick(tile("a.jpg"));

    expect(store.getState().slides).toHaveLength(1);
    expect(notice()).toBe("1 Bild hinzugefügt");
    await waitFor(() => expect(scrolled.length).toBeGreaterThan(0));
  });

  it("reports what was really added, not what was asked for", async () => {
    const { store } = await setup("wide");
    render(
      <AppStoreContext.Provider value={store}>
        <Harness ids={["m1", "a"]} />
      </AppStoreContext.Provider>,
    );

    // Audio does not belong in the filmstrip: addSlide drops it, so the one
    // picture that landed is what the notice may claim.
    await userEvent.setup().click(screen.getByRole("button", { name: "add" }));

    expect(store.getState().slides.map((s) => slideMediaId(s))).toEqual(["a"]);
    expect(store.getState().notice?.text).toBe("1 Bild hinzugefügt");
  });
});
