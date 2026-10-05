import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MusicClip, Slide } from "../lib/apiClient";
import { moveSlide } from "../store/projectOps";
import { audioItem, mediaItem, mockApi } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";

const slides: Slide[] = [
  {
    kind: "image",
    id: "s1",
    mediaId: "a",
    duration: 3,
    effectId: null,
    title: null,
    transitionIn: null,
  },
  {
    kind: "image",
    id: "s2",
    mediaId: "b",
    duration: 4,
    effectId: null,
    title: null,
    transitionIn: { transitionId: "fade", duration: 1.25 },
  },
  {
    kind: "image",
    id: "s3",
    mediaId: "c",
    duration: 5,
    effectId: null,
    title: null,
    transitionIn: { transitionId: "circle", duration: 1.5 },
  },
];
const clip = (id: string, mediaId: string): MusicClip => ({
  id,
  mediaId,
  trimStart: 0,
  trimEnd: null,
  volume: 1,
  fadeIn: false,
  fadeOut: false,
});
const music = [clip("m1", "song"), clip("m2", "tune")];

async function setup(layout: "compact" | "wide" = "compact") {
  if (layout === "compact") mockLayout("compact");
  const api = mockApi({
    listMedia: async () => [
      mediaItem("a"),
      mediaItem("b"),
      mediaItem("c"),
      audioItem("song", 60),
      audioItem("tune", 30),
    ],
    getProject: vi.fn(async () => ({
      schemaVersion: 6 as const,
      narration: [],
      clipAudioBalance: 50,
      slides,
      music,
    })),
  });
  const user = userEvent.setup();
  const view = renderApp(api);
  await act(() => view.ready);
  return { ...view, api, user };
}

const tile = (n: number) => screen.getByRole("button", { name: new RegExp(`^Bild ${n}:`) });
const clipBlock = (n: number) =>
  screen.getByRole("button", { name: new RegExp(`^Musikstück ${n}:`) });
const bar = () => screen.getByRole("toolbar", { name: /^Aktionen:/ });
const action = (name: string) => within(bar()).getByRole("button", { name });

function longPress(el: HTMLElement, move = 0) {
  vi.useFakeTimers();
  try {
    fireEvent.pointerDown(el, { pointerId: 7, pointerType: "touch", clientX: 50, clientY: 50 });
    if (move)
      fireEvent.pointerMove(el, {
        pointerId: 7,
        pointerType: "touch",
        clientX: 50 + move,
        clientY: 50,
      });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerUp(el, {
      pointerId: 7,
      pointerType: "touch",
      clientX: 50 + move,
      clientY: 50,
    });
  } finally {
    vi.useRealTimers();
  }
}

describe("action bar (add-mobile-layout design.md D6)", () => {
  it("is absent without a selection and with a mouse on the desktop", async () => {
    const { user } = await setup("wide");
    await user.click(tile(1));
    expect(screen.queryByRole("toolbar", { name: /^Aktionen:/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aktionen für Bild 1" })).toBeNull();
  });

  it("moves a picture to the right like reordering on the desktop and saves", async () => {
    const { user, store, api } = await setup();
    expect(screen.queryByRole("toolbar", { name: /^Aktionen:/ })).toBeNull();
    await user.click(tile(1));
    expect(bar()).toHaveAccessibleName("Aktionen: Bild 1 des Storyboards");
    expect(action("Nach links")).toBeDisabled();
    await user.click(action("Nach rechts"));
    expect(store.getState().slides).toEqual(moveSlide(slides, 0, 1));
    expect(store.getState().slides.map((s) => s.id)).toEqual(["s2", "s1", "s3"]);
    await act(() => store.getState().flushSave());
    expect(api.saved.at(-1)?.slides).toEqual(store.getState().slides);
  });

  it("moves a picture to the left and disables 'Nach rechts' at the end", async () => {
    const { user, store } = await setup();
    await user.click(tile(3));
    expect(action("Nach rechts")).toBeDisabled();
    await user.click(action("Nach links"));
    expect(store.getState().slides).toEqual(moveSlide(slides, 2, 1));
  });

  it("opens the duration and transition dialogs of the selected picture", async () => {
    const { user } = await setup();
    await user.click(tile(2));
    await user.click(action("Dauer…"));
    expect(screen.getByRole("dialog", { name: "Eigenschaften von Bild 2" })).toHaveClass("sheet");
    await user.click(screen.getByRole("button", { name: "Dialog schließen" }));
    await user.click(action("Übergang davor…"));
    // With touch operation this is the transition sheet (TASK-WEB-042).
    expect(screen.getByRole("dialog", { name: "Übergang" })).toBeInTheDocument();
  });

  it("disables 'Übergang davor…' on the first picture", async () => {
    const { user } = await setup();
    await user.click(tile(1));
    expect(action("Übergang davor…")).toBeDisabled();
  });

  it("removes a picture like Delete on the desktop (neighbour selected)", async () => {
    const { user, store } = await setup();
    await user.click(tile(2));
    await user.click(action("Entfernen"));
    expect(store.getState().slides.map((s) => s.id)).toEqual(["s1", "s3"]);
    expect(store.getState().selection).toEqual({ kind: "slide", slideId: "s3" });
  });

  it("offers the music actions with the same store effect", async () => {
    const { user, store } = await setup();
    await user.click(clipBlock(1));
    expect(bar()).toHaveAccessibleName("Aktionen: Musikstück 1 der Musikleiste");
    await user.click(action("Einblenden"));
    expect(store.getState().music[0]?.fadeIn).toBe(true);
    expect(action("Einblenden")).toHaveAttribute("aria-pressed", "true");
    await user.click(action("Ausblenden"));
    expect(store.getState().music[0]?.fadeOut).toBe(true);
    await user.click(action("Nach rechts"));
    expect(store.getState().music.map((c) => c.id)).toEqual(["m2", "m1"]);
    await user.click(action("Lautstärke…"));
    expect(screen.getByRole("dialog", { name: "Lautstärke von Musikstück 2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dialog schließen" }));
    await user.click(action("Kürzen…"));
    expect(screen.getByRole("dialog", { name: "Musikstück 2 kürzen" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dialog schließen" }));
    await user.click(action("Entfernen"));
    expect(store.getState().music.map((c) => c.id)).toEqual(["m2"]);
    expect(store.getState().musicSelection).toBe("m2");
  });
});

describe("action sheets (long press and ⋯)", () => {
  it("opens the music clip's context menu as a sheet after a 400 ms press", async () => {
    await setup();
    longPress(clipBlock(1));
    const sheet = screen.getByRole("dialog", { name: "Musikstück 1 der Musikleiste" });
    expect(sheet).toHaveClass("sheet");
    const menu = within(sheet).getByRole("menu");
    expect(Array.from(menu.querySelectorAll("button")).map((i) => i.textContent?.trim())).toEqual([
      "Entfernen",
      "Lautstärke…",
      "Einblenden",
      "Ausblenden",
      "Kürzen…",
    ]);
    expect(within(menu).getByRole("menuitemcheckbox", { name: "Einblenden" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("does not open the sheet when the finger moves more than 8 px", async () => {
    await setup();
    longPress(clipBlock(1), 9);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the picture menu via ⋯ and applies its entries like the desktop", async () => {
    const { user, store } = await setup();
    await user.click(screen.getByRole("button", { name: "Aktionen für Bild 3" }));
    const sheet = screen.getByRole("dialog", { name: "Bild 3 des Storyboards" });
    expect(
      within(sheet)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Entfernen", "Keinen Effekt", "Eigenschaften…"]);
    await user.click(within(sheet).getByRole("menuitem", { name: "Entfernen" }));
    expect(store.getState().slides.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toggles a fade from the action sheet", async () => {
    const { user, store } = await setup();
    await user.click(screen.getByRole("button", { name: "Aktionen für Musikstück 2" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Ausblenden" }));
    expect(store.getState().music[1]?.fadeOut).toBe(true);
  });

  it("opens the same sheet from the action bar's ⋯", async () => {
    const { user } = await setup();
    await user.click(tile(2));
    await user.click(action("Weitere Aktionen"));
    expect(screen.getByRole("dialog", { name: "Bild 2 des Storyboards" })).toBeInTheDocument();
  });
});
