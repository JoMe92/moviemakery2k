import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/apiClient";
import { SLIDE_DURATION } from "../store/projectOps";
import { audioItem, mediaItem, mockApi } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";

const slide = (id: string, mediaId: string): Slide => ({
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
    ],
    getProject: vi.fn(async () => ({ schemaVersion: 2 as const, slides, music: [] })),
  });
  const user = userEvent.setup();
  const view = renderApp(api);
  await act(() => view.ready);
  if (locale === "en") act(() => view.store.getState().setLocale("en"));
  const taskbar = screen.getByRole("navigation");
  await user.click(within(taskbar).getAllByRole("button")[1] as HTMLElement);
  await user.click(
    screen.getByRole("button", { name: locale === "de" ? "Sammlungen anzeigen" : "View collections" }),
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
    expect(store.getState().slides.map((s) => [s.mediaId, s.duration])).toEqual([
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

  it("offers Properties and Delete on a long press", async () => {
    const { sheet, user } = await setup();
    const tile = sheet.getByRole("button", { name: "b.jpg" });
    vi.useFakeTimers();
    fireEvent.pointerDown(tile, { pointerId: 3, pointerType: "touch", clientX: 5, clientY: 5 });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerUp(tile, { pointerId: 3, pointerType: "touch", clientX: 5, clientY: 5 });
    vi.useRealTimers();
    const menu = screen.getByRole("menu", { name: "Bild „b.jpg“" });
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Eigenschaften",
      "Löschen",
    ]);
    expect(tile).toHaveAttribute("aria-pressed", "false");
    await user.click(within(menu).getByRole("menuitem", { name: "Eigenschaften" }));
    const props = screen.getByRole("dialog", { name: "Eigenschaften von „b.jpg“" });
    expect(props).toHaveTextContent("640 × 480 Pixel");
  });

  it("deletes via the long-press menu after confirmation", async () => {
    const { sheet, user } = await setup();
    const tile = sheet.getByRole("button", { name: "c.jpg" });
    vi.useFakeTimers();
    fireEvent.pointerDown(tile, { pointerId: 3, pointerType: "touch", clientX: 5, clientY: 5 });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerUp(tile, { pointerId: 3, pointerType: "touch", clientX: 5, clientY: 5 });
    vi.useRealTimers();
    await user.click(screen.getByRole("menuitem", { name: "Löschen" }));
    expect(screen.getByRole("dialog", { name: "Bild löschen" })).toHaveTextContent(
      "Möchten Sie „c.jpg“ wirklich löschen?",
    );
  });

  it("speaks English", async () => {
    const { sheet, user } = await setup([], "en");
    await user.click(sheet.getByRole("button", { name: "a.jpg" }));
    expect(sheet.getByRole("button", { name: "Add to storyboard (1)" })).toBeEnabled();
  });
});
