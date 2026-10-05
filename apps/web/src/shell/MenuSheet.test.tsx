import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MusicClip } from "../lib/apiClient";
import { slideDuration } from "../store/projectOps";
import { audioItem, mediaItem, mockApi } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";

const slides = [
  {
    kind: "image" as const,
    id: "s1",
    mediaId: "a",
    duration: 3,
    effectId: null,
    title: null,
    transitionIn: null,
  },
  {
    kind: "image" as const,
    id: "s2",
    mediaId: "b",
    duration: 3,
    effectId: null,
    title: null,
    transitionIn: null,
  },
];
const clip: MusicClip = {
  id: "c1",
  mediaId: "song",
  trimStart: 0,
  trimEnd: null,
  volume: 1,
  fadeIn: false,
  fadeOut: false,
};

async function openMenu(api = mockApi()) {
  mockLayout("compact");
  const user = userEvent.setup();
  const view = renderApp(api);
  await view.ready;
  const trigger = within(screen.getByRole("banner")).getByRole("button", { name: "Menü" });
  await user.click(trigger);
  const sheet = screen.getByRole("dialog", { name: "Menü" });
  const group = async (name: string) => {
    await user.click(within(sheet).getByRole("button", { name }));
    return within(sheet);
  };
  return { ...view, user, trigger, sheet, group };
}

describe("menu sheet (add-mobile-layout design.md D11)", () => {
  it("lists every menu of the menu bar as a collapsed group", async () => {
    const { sheet } = await openMenu();
    const headers = within(sheet)
      .getAllByRole("button", { expanded: false })
      .map((b) => b.textContent);
    expect(headers).toEqual([
      "Datei",
      "Bearbeiten",
      "Ansicht",
      "Extras",
      "Clip",
      "Wiedergabe",
      "Hilfe",
    ]);
    expect(screen.queryByRole("menubar")).toBeNull();
  });

  it("creates a new project on the phone", async () => {
    const api = mockApi({
      getProject: vi.fn(async () => ({
        schemaVersion: 6 as const,
        narration: [],
        clipAudioBalance: 50,
        slides,
        music: [],
      })),
    });
    const { user, group, store } = await openMenu(api);
    const media = store.getState().media;
    const file = await group("Datei");
    await user.click(file.getByRole("button", { name: "Neues Projekt" }));
    const confirm = screen.getByRole("dialog", { name: "Neues Projekt" });
    await user.click(within(confirm).getByRole("button", { name: "Ja" }));
    expect(store.getState().slides).toEqual([]);
    expect(store.getState().media).toBe(media);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("disables 'Film speichern…' with an empty storyboard and hides shortcuts", async () => {
    const { group, store } = await openMenu();
    const file = await group("Datei");
    const save = file.getByRole("button", { name: "Film speichern…" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(save);
    expect(store.getState().exportWizardOpen).toBe(false);
    const edit = await group("Bearbeiten");
    expect(edit.getByRole("button", { name: "Löschen" })).toBeInTheDocument();
    expect(edit.queryByText("Entf")).toBeNull();
    const play = await group("Wiedergabe");
    expect(play.queryByText("Leertaste")).toBeNull();
  });

  it("opens 'Film speichern…' when the storyboard has pictures", async () => {
    const api = mockApi({
      getProject: vi.fn(async () => ({
        schemaVersion: 6 as const,
        narration: [],
        clipAudioBalance: 50,
        slides,
        music: [],
      })),
    });
    const { user, group, store } = await openMenu(api);
    const file = await group("Datei");
    await user.click(file.getByRole("button", { name: "Film speichern…" }));
    expect(store.getState().exportWizardOpen).toBe(true);
  });

  it("fits the movie to the music via Clip", async () => {
    const api = mockApi({
      listMedia: async () => [mediaItem("a"), mediaItem("b"), audioItem("song", 20)],
      getProject: vi.fn(async () => ({
        schemaVersion: 6 as const,
        narration: [],
        clipAudioBalance: 50,
        slides,
        music: [clip],
      })),
    });
    const { user, group, store } = await openMenu(api);
    const clipMenu = await group("Clip");
    await user.click(clipMenu.getByRole("button", { name: "Film an Musik anpassen" }));
    expect(store.getState().slides.map((s) => slideDuration(s))).toEqual([10, 10]);
  });

  it("shows Help → About as a sheet", async () => {
    const { user, group } = await openMenu();
    const help = await group("Hilfe");
    await user.click(help.getByRole("button", { name: "Info" }));
    expect(screen.getByRole("dialog", { name: "Info über moviemakerY2K" })).toHaveClass("sheet");
  });
});
