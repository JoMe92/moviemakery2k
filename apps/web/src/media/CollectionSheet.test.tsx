import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/apiClient";
import { SLIDE_DURATION, slideDuration } from "../store/projectOps";
import { audioItem, mediaItem, mockApi, videoItem } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";
import { HOLD_MS } from "../ui/useLongPress";

/**
 * A touch press on `tile` held `ms` and released, the way a finger does it -
 * `user.click()` is instantaneous and cannot tell a tap from a hold (mmy-43e).
 */
function holdTile(tile: HTMLElement, ms: number) {
  const touch = { pointerId: 3, pointerType: "touch", clientX: 5, clientY: 5 };
  vi.useFakeTimers();
  try {
    fireEvent.pointerDown(tile, touch);
    act(() => vi.advanceTimersByTime(ms));
    fireEvent.pointerUp(tile, touch);
  } finally {
    vi.useRealTimers();
  }
}

const slide = (id: string, mediaId: string): Slide => ({
  kind: "image",
  id,
  mediaId,
  duration: 3,
  transitionIn: null,
});

async function setup(slides: Slide[] = [], locale: "de" | "en" = "de") {
  mockLayout("compact");
  const api = mockApi({
    listMedia: async () => [
      mediaItem("a"),
      mediaItem("b"),
      mediaItem("c"),
      audioItem("song", 60),
      audioItem("tune", 30),
      videoItem("clip", 12),
    ],
    getProject: vi.fn(async () => ({ schemaVersion: 3 as const, slides, music: [] })),
  });
  const user = userEvent.setup();
  const view = renderApp(api);
  await act(() => view.ready);
  if (locale === "en") act(() => view.store.getState().setLocale("en"));
  const taskbar = screen.getByRole("navigation");
  await user.click(within(taskbar).getAllByRole("button")[1] as HTMLElement);
  await user.click(
    screen.getByRole("button", {
      name: locale === "de" ? "Sammlungen anzeigen" : "View collections",
    }),
  );
  const sheet = screen.getByRole("dialog", {
    name: locale === "de" ? "Sammlungen" : "Collections",
  });
  return { ...view, user, sheet: within(sheet), sheetEl: sheet };
}

describe("collection sheet (add-mobile-layout design.md D7)", () => {
  it("offers the three tabs and Import", async () => {
    const { sheet, user, store } = await setup();
    expect(sheet.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Meine Bilder",
      "Meine Musik",
      "Meine Videos",
      "Videoübergänge",
    ]);
    const input = screen.getByTestId("media-import-input") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    await user.click(sheet.getByRole("button", { name: "Importieren" }));
    expect(click).toHaveBeenCalledOnce();
    expect(input.accept).toBe("image/jpeg,image/png,image/webp");
    await user.click(sheet.getByRole("tab", { name: "Videoübergänge" }));
    expect(store.getState().collection).toBe("transitions");
    expect(sheet.getByRole("list", { name: "Übergänge" })).toBeInTheDocument();
  });

  it("adds three pictures in the order C, A, B and closes", async () => {
    const { sheet, user, store } = await setup();
    const add = () => sheet.getByRole("button", { name: /^Zum Bildstreifen hinzufügen/ });
    expect(add()).toHaveAccessibleName("Zum Bildstreifen hinzufügen (0)");
    expect(add()).toBeDisabled();
    for (const name of ["c.jpg", "a.jpg", "b.jpg"]) {
      await user.click(sheet.getByRole("button", { name }));
    }
    expect(sheet.getByRole("button", { name: "c.jpg" })).toHaveAttribute("aria-pressed", "true");
    expect(sheet.getByRole("button", { name: "c.jpg" })).toHaveClass("pickable");
    // Picking tiles are plain buttons, not disabled draggables.
    expect(sheet.getByRole("button", { name: "a.jpg" })).not.toHaveAttribute("aria-disabled");
    expect(sheet.getByRole("button", { name: "a.jpg" })).not.toHaveAttribute(
      "aria-roledescription",
    );
    await user.click(add());
    expect(store.getState().slides.map((s) => [s.mediaId, slideDuration(s)])).toEqual([
      ["c", SLIDE_DURATION.default],
      ["a", SLIDE_DURATION.default],
      ["b", SLIDE_DURATION.default],
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toggles a pick off again and disables the button without picks", async () => {
    const { sheet, user } = await setup();
    const tile = sheet.getByRole("button", { name: "a.jpg" });
    await user.click(tile);
    expect(sheet.getByRole("button", { name: "Zum Bildstreifen hinzufügen (1)" })).toBeEnabled();
    await user.click(tile);
    expect(tile).toHaveAttribute("aria-pressed", "false");
    expect(sheet.getByRole("button", { name: "Zum Bildstreifen hinzufügen (0)" })).toBeDisabled();
  });

  it("inserts after the selected picture", async () => {
    const { store, user, sheet } = await setup([slide("s1", "a"), slide("s2", "b")]);
    act(() => store.getState().select({ kind: "slide", slideId: "s1" }));
    await user.click(sheet.getByRole("button", { name: "c.jpg" }));
    await user.click(sheet.getByRole("button", { name: "b.jpg" }));
    await user.click(sheet.getByRole("button", { name: "Zum Bildstreifen hinzufügen (2)" }));
    expect(store.getState().slides.map((s) => s.mediaId)).toEqual(["a", "c", "b", "b"]);
  });

  it("adds music at the end of the music track in pick order", async () => {
    const { sheet, user, store } = await setup();
    await user.click(sheet.getByRole("tab", { name: "Meine Musik" }));
    await user.click(sheet.getByRole("button", { name: /^tune\.mp3/ }));
    await user.click(sheet.getByRole("button", { name: /^song\.mp3/ }));
    await user.click(sheet.getByRole("button", { name: "Zur Musikleiste hinzufügen (2)" }));
    expect(store.getState().music.map((c) => c.mediaId)).toEqual(["tune", "song"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers Properties and Delete after a held press", async () => {
    const { sheet, user } = await setup();
    const tile = sheet.getByRole("button", { name: "b.jpg" });
    holdTile(tile, HOLD_MS);
    const menu = screen.getByRole("menu", { name: "Bild „b.jpg“" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Eigenschaften", "Löschen"]);
    expect(tile).toHaveAttribute("aria-pressed", "false");
    await user.click(within(menu).getByRole("menuitem", { name: "Eigenschaften" }));
    const props = screen.getByRole("dialog", { name: "Eigenschaften von „b.jpg“" });
    expect(props).toHaveTextContent("640 × 480 Pixel");
  });

  it("deletes via the long-press menu after confirmation", async () => {
    const { sheet, user } = await setup();
    const tile = sheet.getByRole("button", { name: "c.jpg" });
    holdTile(tile, HOLD_MS);
    await user.click(screen.getByRole("menuitem", { name: "Löschen" }));
    expect(screen.getByRole("dialog", { name: "Bild löschen" })).toHaveTextContent(
      "Möchten Sie „c.jpg“ wirklich löschen?",
    );
  });

  // mmy-43e: a deliberate tap on a phone lasts 400-700 ms. Each of these used
  // to be read as a long press on release, so the tile was never picked and the
  // storyboard stayed empty.
  it.each([120, 300, 450, 700, HOLD_MS - 1])("picks the tile on a %i ms tap", async (ms) => {
    const { sheet } = await setup();
    const tile = sheet.getByRole("button", { name: "b.jpg" });
    holdTile(tile, ms);
    expect(tile).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(sheet.getByRole("button", { name: "Zum Bildstreifen hinzufügen (1)" })).toBeEnabled();
    holdTile(tile, ms);
    expect(tile).toHaveAttribute("aria-pressed", "false");
  });

  it("marks the tile armed before the held press opens the menu", async () => {
    const { sheet } = await setup();
    const tile = sheet.getByRole("button", { name: "b.jpg" });
    const touch = { pointerId: 3, pointerType: "touch", clientX: 5, clientY: 5 };
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(tile, touch);
      act(() => vi.advanceTimersByTime(HOLD_MS - 1));
      expect(tile).not.toHaveAttribute("data-armed");
      act(() => vi.advanceTimersByTime(1));
      // Armed, but still nothing decided: the finger has not been lifted.
      expect(tile).toHaveAttribute("data-armed", "true");
      expect(screen.queryByRole("menu")).toBeNull();
      fireEvent.pointerUp(tile, touch);
    } finally {
      vi.useRealTimers();
    }
    expect(screen.getByRole("menu", { name: "Bild „b.jpg“" })).toBeInTheDocument();
    expect(tile).not.toHaveAttribute("data-armed");
    expect(tile).toHaveAttribute("aria-pressed", "false");
  });

  it("drags out of an armed press without opening the menu", async () => {
    const { sheet } = await setup();
    const tile = sheet.getByRole("button", { name: "b.jpg" });
    const touch = { pointerId: 3, pointerType: "touch", clientX: 5, clientY: 5 };
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(tile, touch);
      act(() => vi.advanceTimersByTime(HOLD_MS));
      expect(tile).toHaveAttribute("data-armed", "true");
      fireEvent.pointerMove(tile, { ...touch, clientX: 40 });
      expect(tile).not.toHaveAttribute("data-armed");
      fireEvent.pointerUp(tile, { ...touch, clientX: 40 });
    } finally {
      vi.useRealTimers();
    }
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("picks a video and adds it to the storyboard (add-timeline-editing D2)", async () => {
    const { sheet, user, store } = await setup();
    await user.click(sheet.getByRole("tab", { name: "Meine Videos" }));
    expect(store.getState().collection).toBe("video");
    const tile = sheet.getByRole("button", { name: /^clip\.mp4/ });
    await user.click(tile);
    expect(tile).toHaveAttribute("aria-pressed", "true");
    await user.click(sheet.getByRole("button", { name: "Zum Bildstreifen hinzufügen (1)" }));
    expect(store.getState().slides.map((s) => [s.kind, s.mediaId])).toEqual([["video", "clip"]]);
  });

  it("shows a video's Properties and Delete in the long-press menu", async () => {
    const { sheet, user, store } = await setup();
    await user.click(sheet.getByRole("tab", { name: "Meine Videos" }));
    expect(store.getState().collection).toBe("video");
    const tile = sheet.getByRole("button", { name: /^clip\.mp4/ });
    const input = screen.getByTestId("media-import-input") as HTMLInputElement;
    vi.spyOn(input, "click");
    await user.click(sheet.getByRole("button", { name: "Importieren" }));
    expect(input.accept).toMatch(/video/);
    // A video is picked like a picture now, so the menu needs the same hold.
    holdTile(tile, HOLD_MS);
    const menu = screen.getByRole("menu", { name: "Video „clip.mp4“" });
    await user.click(within(menu).getByRole("menuitem", { name: "Eigenschaften" }));
    expect(screen.getByRole("dialog", { name: "Eigenschaften von „clip.mp4“" })).toHaveTextContent(
      "Video",
    );
  });

  it("speaks English", async () => {
    const { sheet, user } = await setup([], "en");
    await user.click(sheet.getByRole("button", { name: "a.jpg" }));
    expect(sheet.getByRole("button", { name: "Add to storyboard (1)" })).toBeEnabled();
  });
});
