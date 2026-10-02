import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "../lib/apiClient";
import { audioItem, mediaItem, mockApi } from "../store/testApi";
import { renderApp } from "../test/renderApp";
import { AUDIO_ACCEPT, IMPORT_ACCEPT, importCollection, looksLikeAudio } from "./useImport";

const AUDIO_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  flac: "audio/flac",
  wav: "audio/wav",
};

const file = (name: string) => {
  const ext = name.split(".").pop() ?? "";
  return new File(["x"], name, { type: AUDIO_TYPES[ext] ?? "image/jpeg" });
};

/** Upload mock: audio extensions come back as audio items, the rest as pictures. */
const uploaded = (f: File) => ({
  ok: true as const,
  filename: f.name,
  item: (/\.(mp3|flac|wav)$/.test(f.name)
    ? audioItem(f.name, 192.4, f.name)
    : { ...mediaItem(f.name), filename: f.name }) as MediaItem,
});

function importApi(media: MediaItem[] = []) {
  return mockApi({
    listMedia: vi.fn(async () => media),
    uploadMedia: vi.fn(async (f: File) => uploaded(f)),
  });
}

const LABELS = {
  de: {
    pictures: "Sammlung: Meine Bilder",
    music: "Sammlung: Meine Musik",
    musicOption: "Meine Musik",
    musicList: "Musik",
    picturesList: "Bilder",
    importAudio: "Audio oder Musik importieren",
    showCollections: "Sammlungen anzeigen",
    tile: "song.mp3, 3:12",
    empty:
      "Diese Sammlung ist leer. Wählen Sie „Audio oder Musik importieren“ oder ziehen Sie Audiodateien hierher.",
    menu: "Audioclip „song.mp3“",
    del: "Löschen",
    title: "Audioclip löschen",
    question: "Möchten Sie „song.mp3“ wirklich löschen? Es wird auch aus der Musikleiste entfernt.",
    yes: "Ja",
  },
  en: {
    pictures: "Collection: My Pictures",
    music: "Collection: My Music",
    musicOption: "My Music",
    musicList: "Music",
    picturesList: "Pictures",
    importAudio: "Import audio or music",
    showCollections: "View collections",
    tile: "song.mp3, 3:12",
    empty: "This collection is empty. Choose “Import audio or music” or drag audio files here.",
    menu: "Audio clip “song.mp3”",
    del: "Delete",
    title: "Delete Audio Clip",
    question:
      "Are you sure you want to delete “song.mp3”? It will also be removed from the music track.",
    yes: "Yes",
  },
} as const;

type Locale = keyof typeof LABELS;
const LOCALES = Object.keys(LABELS) as Locale[];

function tileLabels(region: string, list: string): string[] {
  const pane = screen.getByRole("region", { name: region });
  const ul = within(pane).queryByRole("list", { name: list });
  if (!ul) return [];
  return within(ul)
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? "");
}

describe("import helpers", () => {
  it("offers images and audio in the general dialog and only audio in the audio dialog", () => {
    expect(IMPORT_ACCEPT.any).toContain("image/jpeg");
    expect(IMPORT_ACCEPT.any).toContain("audio/*");
    expect(IMPORT_ACCEPT.pictures).not.toContain("audio");
    expect(AUDIO_ACCEPT.split(",")).toEqual([
      "audio/*",
      ".mp3",
      ".wav",
      ".m4a",
      ".aac",
      ".ogg",
      ".oga",
      ".opus",
      ".flac",
    ]);
  });

  it("picks the collection by the files and the request", () => {
    expect(looksLikeAudio(new File(["x"], "a.OPUS"))).toBe(true);
    expect(looksLikeAudio(new File(["x"], "a.bin", { type: "audio/ogg" }))).toBe(true);
    expect(looksLikeAudio(file("a.jpg"))).toBe(false);
    expect(importCollection([file("a.jpg"), file("b.flac")])).toBe("media");
    expect(importCollection([file("b.flac")])).toBe("music");
    expect(importCollection([file("a.jpg")], "audio")).toBe("music");
  });
});

describe("“My Music” collection", () => {
  it("puts pictures into “My Pictures” and audio into “My Music” after a mixed drop", async () => {
    const { ready, store, api } = renderApp(importApi());
    await act(() => ready);
    const pane = screen.getByRole("region", { name: LABELS.de.pictures });
    const files = [file("eins.jpg"), file("zwei.jpg"), file("lied.flac")];
    fireEvent.drop(pane, { dataTransfer: { types: ["Files"], files } });

    await waitFor(() => expect(api.uploadMedia).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(tileLabels(LABELS.de.pictures, LABELS.de.picturesList)).toEqual([
        "eins.jpg",
        "zwei.jpg",
      ]),
    );
    // The mixed import keeps "My Pictures" open; audio is not shown there.
    expect(store.getState().collection).toBe("media");

    act(() => store.getState().setCollection("music"));
    expect(tileLabels(LABELS.de.music, LABELS.de.musicList)).toEqual(["lied.flac, 3:12"]);
  });

  it("puts pictures and audio of a mixed file-dialog import into their collections", async () => {
    const user = userEvent.setup();
    const { ready, store } = renderApp(importApi());
    await act(() => ready);
    await user.upload(screen.getByTestId("media-import-input"), [
      file("a.jpg"),
      file("song.mp3"),
      file("b.jpg"),
    ]);
    await waitFor(() =>
      expect(tileLabels(LABELS.de.pictures, LABELS.de.picturesList)).toEqual(["a.jpg", "b.jpg"]),
    );
    act(() => store.getState().setCollection("music"));
    expect(tileLabels(LABELS.de.music, LABELS.de.musicList)).toEqual(["song.mp3, 3:12"]);
  });

  it("shows “My Music” after an import that contains only audio", async () => {
    const user = userEvent.setup();
    const { ready, store } = renderApp(importApi());
    await act(() => ready);
    await user.upload(screen.getByTestId("media-import-input"), [file("song.mp3")]);
    await waitFor(() =>
      expect(tileLabels(LABELS.de.music, LABELS.de.musicList)).toEqual(["song.mp3, 3:12"]),
    );
    expect(store.getState().collection).toBe("music");
  });

  it.each(LOCALES)("shows an audio tile with icon, name and duration (%s)", async (locale) => {
    localStorage.setItem("mmy.locale", locale);
    const l = LABELS[locale];
    const { ready, store } = renderApp(importApi([mediaItem("a"), audioItem("song")]));
    await act(() => ready);

    const select = screen.getByRole("combobox", { name: /Sammlungen|Collections/ });
    expect(within(select).getByRole("option", { name: l.musicOption })).toBeInTheDocument();
    await userEvent.setup().selectOptions(select, "music");
    expect(store.getState().collection).toBe("music");

    const pane = screen.getByRole("region", { name: l.music });
    const tile = within(pane).getByRole("button", { name: l.tile });
    expect(tile).toHaveTextContent("song.mp3");
    expect(tile).toHaveTextContent("3:12");
    // Own SVG icon instead of a thumbnail.
    expect(tile.querySelector("svg")).not.toBeNull();
    expect(tile.querySelector("img")).toBeNull();
    // Only audio in "My Music", only pictures in "My Pictures".
    expect(tileLabels(l.music, l.musicList)).toEqual([l.tile]);
    act(() => store.getState().setCollection("media"));
    expect(tileLabels(l.pictures, l.picturesList)).toEqual(["a.jpg"]);
  });

  it.each(LOCALES)("shows a hint for an empty “My Music” (%s)", async (locale) => {
    localStorage.setItem("mmy.locale", locale);
    const { ready, store } = renderApp(importApi([mediaItem("a")]));
    await act(() => ready);
    act(() => store.getState().setCollection("music"));
    expect(screen.getByRole("region", { name: LABELS[locale].music })).toHaveTextContent(
      LABELS[locale].empty,
    );
  });

  it.each(LOCALES)(
    "enables “Import audio or music”, opens the audio picker and shows “My Music” (%s)",
    async (locale) => {
      localStorage.setItem("mmy.locale", locale);
      const l = LABELS[locale];
      const user = userEvent.setup();
      const { ready, store, api } = renderApp(importApi());
      await act(() => ready);
      store.getState().setCollection("transitions");

      const task = screen.getByRole("button", { name: l.importAudio });
      expect(task).toBeEnabled();
      expect(task).not.toHaveAttribute("aria-disabled", "true");

      const input = screen.getByTestId("media-import-input") as HTMLInputElement;
      const clicked = vi.spyOn(input, "click");
      await user.click(task);
      expect(clicked).toHaveBeenCalledTimes(1);
      expect(store.getState().importKind).toBe("audio");
      expect(input).toHaveAttribute("accept", AUDIO_ACCEPT);
      expect(input.multiple).toBe(true);

      await user.upload(input, [file("song.mp3")]);
      await waitFor(() => expect(tileLabels(l.music, l.musicList)).toEqual([l.tile]));
      expect(store.getState().collection).toBe("music");
      expect(api.uploadMedia).toHaveBeenCalledTimes(1);

      // "View collections" stays on "My Music".
      await user.click(screen.getByRole("button", { name: l.showCollections }));
      expect(store.getState().collection).toBe("music");
    },
  );

  it("keeps “Import pictures” restricted to pictures and the File menu open to both", async () => {
    const user = userEvent.setup();
    const { ready, store } = renderApp(importApi());
    await act(() => ready);
    const input = screen.getByTestId("media-import-input");
    vi.spyOn(input, "click").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "Bilder importieren" }));
    expect(input).toHaveAttribute("accept", IMPORT_ACCEPT.pictures);
    act(() => store.getState().requestImport());
    expect(input).toHaveAttribute("accept", IMPORT_ACCEPT.any);
  });

  it("adds audio to the music track, never to the filmstrip (double-click, context menu, store)", async () => {
    const user = userEvent.setup();
    const { ready, store } = renderApp(importApi([mediaItem("a"), audioItem("song")]));
    await act(() => ready);
    act(() => store.getState().setCollection("music"));
    const tile = screen.getByRole("button", { name: LABELS.de.tile });

    await user.dblClick(tile);
    act(() => store.getState().addSlide("song"));
    expect(store.getState().slides).toEqual([]);
    expect(store.getState().music.map((c) => c.mediaId)).toEqual(["song"]);

    fireEvent.contextMenu(tile, { clientX: 10, clientY: 10 });
    const menu = screen.getByRole("menu", { name: LABELS.de.menu });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((m) => m.textContent),
    ).toEqual(["Zur Musikleiste hinzufügen", "Löschen"]);
    await user.click(within(menu).getByRole("menuitem", { name: "Zur Musikleiste hinzufügen" }));
    expect(store.getState().music.map((c) => c.mediaId)).toEqual(["song", "song"]);
    // A dnd-kit draggable for the music track (the filmstrip refuses it).
    expect(tile).toHaveAttribute("aria-roledescription", "ziehbares Audio");

    // Pictures still work.
    act(() => store.getState().addSlide("a"));
    expect(store.getState().slides.map((s) => s.mediaId)).toEqual(["a"]);
  });

  it.each(LOCALES)("deletes an audio tile after confirmation (%s)", async (locale) => {
    localStorage.setItem("mmy.locale", locale);
    const l = LABELS[locale];
    const user = userEvent.setup();
    const api = importApi([mediaItem("a"), audioItem("song"), audioItem("other")]);
    const { ready, store } = renderApp(api);
    await act(() => ready);
    act(() => store.getState().setCollection("music"));

    const tile = screen.getByRole("button", { name: l.tile });
    fireEvent.contextMenu(tile, { clientX: 10, clientY: 10 });
    const menu = screen.getByRole("menu", { name: l.menu });
    await user.click(within(menu).getByRole("menuitem", { name: l.del }));

    const dialog = screen.getByRole("dialog", { name: l.title });
    expect(dialog).toHaveTextContent(l.question);
    await user.click(within(dialog).getByRole("button", { name: l.yes }));

    await waitFor(() => expect(api.deleteMedia).toHaveBeenCalledWith("song"));
    await waitFor(() => expect(tileLabels(l.music, l.musicList)).toEqual(["other.mp3, 3:12"]));
    expect(store.getState().media.map((m) => m.id)).toEqual(["a", "other"]);
    // Focus moves to the neighbouring audio tile.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "other.mp3, 3:12" })).toHaveFocus(),
    );
  });

  it("deletes an audio tile with the Delete key", async () => {
    const user = userEvent.setup();
    const api = importApi([audioItem("song")]);
    const { ready, store } = renderApp(api);
    await act(() => ready);
    act(() => store.getState().setCollection("music"));
    screen.getByRole("button", { name: LABELS.de.tile }).focus();
    await user.keyboard("{Delete}");
    await user.click(screen.getByRole("button", { name: "Ja" }));
    await waitFor(() => expect(store.getState().media).toEqual([]));
  });
});
