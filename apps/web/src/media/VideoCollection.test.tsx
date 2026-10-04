import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError, type MediaItem } from "../lib/apiClient";
import { mediaItem, mockApi, videoItem } from "../store/testApi";
import { renderApp } from "../test/renderApp";
import { IMPORT_ACCEPT, importCollection, looksLikeVideo, VIDEO_ACCEPT } from "./useImport";

const VIDEO_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  webm: "video/webm",
};

const file = (name: string) => {
  const ext = name.split(".").pop() ?? "";
  return new File(["x"], name, { type: VIDEO_TYPES[ext] ?? "image/jpeg" });
};

/** Upload mock: video extensions come back as video items, the rest as pictures. */
const uploaded = (f: File) => ({
  ok: true as const,
  filename: f.name,
  item: (/\.(mp4|mkv|webm)$/.test(f.name)
    ? videoItem(f.name, 105.0, f.name)
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
    video: "Sammlung: Meine Videos",
    videoOption: "Meine Videos",
    videoList: "Videos",
    picturesList: "Bilder",
    importVideo: "Video importieren",
    showCollections: "Sammlungen anzeigen",
    tile: "clip.mp4, 1:45",
    empty:
      "Diese Sammlung ist leer. Wählen Sie „Video importieren“ oder ziehen Sie Videodateien hierher.",
    menu: "Video „clip.mp4“",
    del: "Löschen",
    addToStoryboard: "Zum Storyboard hinzufügen",
    title: "Video löschen",
    question: "Möchten Sie „clip.mp4“ wirklich löschen? Es wird auch aus dem Storyboard entfernt.",
    yes: "Ja",
  },
  en: {
    pictures: "Collection: My Pictures",
    video: "Collection: My Videos",
    videoOption: "My Videos",
    videoList: "Videos",
    picturesList: "Pictures",
    importVideo: "Import video",
    showCollections: "View collections",
    tile: "clip.mp4, 1:45",
    empty: "This collection is empty. Choose “Import video” or drag video files here.",
    menu: "Video “clip.mp4”",
    del: "Delete",
    addToStoryboard: "Add to Storyboard",
    title: "Delete Video",
    question:
      "Are you sure you want to delete “clip.mp4”? It will also be removed from the storyboard.",
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
  it("offers images, video and audio in the general dialog and only video in the video dialog", () => {
    expect(IMPORT_ACCEPT.any).toContain("image/jpeg");
    expect(IMPORT_ACCEPT.any).toContain("video/*");
    expect(IMPORT_ACCEPT.any).toContain("audio/*");
    expect(IMPORT_ACCEPT.pictures).not.toContain("video");
    expect(IMPORT_ACCEPT.audio).not.toContain("video");
    expect(VIDEO_ACCEPT.split(",")).toEqual(["video/*", ".mp4", ".mov", ".m4v", ".mkv", ".webm"]);
  });

  it("picks the collection by the files and the request", () => {
    expect(looksLikeVideo(new File(["x"], "a.MP4"))).toBe(true);
    expect(looksLikeVideo(new File(["x"], "a.bin", { type: "video/webm" }))).toBe(true);
    expect(looksLikeVideo(file("a.jpg"))).toBe(false);
    expect(importCollection([file("a.jpg"), file("b.mp4")])).toBe("media");
    expect(importCollection([file("b.mp4")])).toBe("video");
    expect(importCollection([file("a.jpg")], "video")).toBe("video");
  });
});

describe("“My Videos” collection", () => {
  it("sorts a mixed drop of pictures, audio and video into their three collections", async () => {
    const uploadedMixed = (f: File) => ({
      ok: true as const,
      filename: f.name,
      item: (f.name.endsWith(".flac")
        ? { ...videoItem("audio-placeholder"), kind: "audio" as const, filename: f.name }
        : f.name.endsWith(".mp4")
          ? videoItem(f.name, 105.0, f.name)
          : { ...mediaItem(f.name), filename: f.name }) as MediaItem,
    });
    const api = mockApi({
      listMedia: vi.fn(async () => []),
      uploadMedia: vi.fn(async (f: File) => uploadedMixed(f)),
    });
    const { ready, store } = renderApp(api);
    await act(() => ready);
    const pane = screen.getByRole("region", { name: LABELS.de.pictures });
    const files = [file("a.jpg"), file("b.jpg"), file("song.flac"), file("clip.mp4")];
    fireEvent.drop(pane, { dataTransfer: { types: ["Files"], files } });

    await waitFor(() =>
      expect(tileLabels(LABELS.de.pictures, LABELS.de.picturesList)).toEqual(["a.jpg", "b.jpg"]),
    );
    // A mixed import of all three kinds keeps "My Pictures" open as the default.
    expect(store.getState().collection).toBe("media");

    act(() => store.getState().setCollection("music"));
    expect(tileLabels("Sammlung: Meine Musik", "Musik")).toEqual(["song.flac, 1:45"]);

    act(() => store.getState().setCollection("video"));
    expect(tileLabels(LABELS.de.video, LABELS.de.videoList)).toEqual(["clip.mp4, 1:45"]);
  });

  it("shows “My Videos” after an import that contains only video", async () => {
    const user = userEvent.setup();
    const { ready, store } = renderApp(importApi());
    await act(() => ready);
    await user.upload(screen.getByTestId("media-import-input"), [file("clip.mp4")]);
    await waitFor(() =>
      expect(tileLabels(LABELS.de.video, LABELS.de.videoList)).toEqual(["clip.mp4, 1:45"]),
    );
    expect(store.getState().collection).toBe("video");
  });

  it.each(LOCALES)(
    "shows a video tile with poster, name and duration “1:45” (%s)",
    async (locale) => {
      localStorage.setItem("mmy.locale", locale);
      const l = LABELS[locale];
      const { ready, store } = renderApp(importApi([mediaItem("a"), videoItem("clip")]));
      await act(() => ready);

      const select = screen.getByRole("combobox", { name: /Sammlungen|Collections/ });
      expect(within(select).getByRole("option", { name: l.videoOption })).toBeInTheDocument();
      await userEvent.setup().selectOptions(select, "video");
      expect(store.getState().collection).toBe("video");

      const pane = screen.getByRole("region", { name: l.video });
      const tile = within(pane).getByRole("button", { name: l.tile });
      expect(tile).toHaveTextContent("clip.mp4");
      expect(tile).toHaveTextContent("1:45");
      const img = tile.querySelector("img");
      expect(img).not.toBeNull();
      expect(img).toHaveAttribute("src", "/api/media/clip/poster");
      expect(tile.querySelector("svg")).toBeNull();
      // Only video in "My Videos", only pictures in "My Pictures".
      expect(tileLabels(l.video, l.videoList)).toEqual([l.tile]);
      act(() => store.getState().setCollection("media"));
      expect(tileLabels(l.pictures, l.picturesList)).toEqual(["a.jpg"]);
    },
  );

  it.each(LOCALES)("shows a hint for an empty “My Videos” (%s)", async (locale) => {
    localStorage.setItem("mmy.locale", locale);
    const { ready, store } = renderApp(importApi([mediaItem("a")]));
    await act(() => ready);
    act(() => store.getState().setCollection("video"));
    expect(screen.getByRole("region", { name: LABELS[locale].video })).toHaveTextContent(
      LABELS[locale].empty,
    );
  });

  it.each(LOCALES)(
    "enables “Import video”, opens the filtered picker and shows “My Videos” (%s)",
    async (locale) => {
      localStorage.setItem("mmy.locale", locale);
      const l = LABELS[locale];
      const user = userEvent.setup();
      const { ready, store, api } = renderApp(importApi());
      await act(() => ready);
      store.getState().setCollection("transitions");

      const task = screen.getByRole("button", { name: l.importVideo });
      expect(task).toBeEnabled();
      expect(task).not.toHaveAttribute("aria-disabled", "true");

      const input = screen.getByTestId("media-import-input") as HTMLInputElement;
      const clicked = vi.spyOn(input, "click");
      await user.click(task);
      expect(clicked).toHaveBeenCalledTimes(1);
      expect(store.getState().importKind).toBe("video");
      expect(input).toHaveAttribute("accept", VIDEO_ACCEPT);
      expect(input.multiple).toBe(true);

      await user.upload(input, [file("clip.mp4")]);
      await waitFor(() => expect(tileLabels(l.video, l.videoList)).toEqual([l.tile]));
      expect(store.getState().collection).toBe("video");
      expect(api.uploadMedia).toHaveBeenCalledTimes(1);

      // "View collections" stays on "My Videos".
      await user.click(screen.getByRole("button", { name: l.showCollections }));
      expect(store.getState().collection).toBe("video");
    },
  );

  it("appends a video clip by double-click: full trim, no transition", async () => {
    const { ready, store } = renderApp(importApi([videoItem("clip", 8)]));
    await act(() => ready);
    act(() => store.getState().setCollection("video"));
    const tile = screen.getByRole("button", { name: "clip.mp4, 0:08" });
    // Draggable like a picture/audio tile (unlike before add-timeline-editing).
    expect(tile).toHaveAttribute("aria-roledescription", "ziehbares Video");

    await userEvent.setup().dblClick(tile);
    expect(store.getState().slides).toHaveLength(1);
    expect(store.getState().slides[0]).toMatchObject({
      kind: "video",
      mediaId: "clip",
      trimIn: 0,
      trimOut: 8,
      transitionIn: null,
    });
    expect(store.getState().music).toEqual([]);
  });

  it("offers “Add to Storyboard” in a video tile's context menu", async () => {
    const { ready, store } = renderApp(importApi([videoItem("clip")]));
    await act(() => ready);
    act(() => store.getState().setCollection("video"));
    const tile = screen.getByRole("button", { name: LABELS.de.tile });

    fireEvent.contextMenu(tile, { clientX: 10, clientY: 10 });
    const menu = screen.getByRole("menu", { name: LABELS.de.menu });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((m) => m.textContent),
    ).toEqual([LABELS.de.addToStoryboard, LABELS.de.del]);
    await userEvent.setup().click(within(menu).getByRole("menuitem", { name: LABELS.de.del }));
    screen.getByRole("dialog", { name: LABELS.de.title });
    await userEvent.setup().click(screen.getByRole("button", { name: "Nein" }));

    fireEvent.contextMenu(tile, { clientX: 10, clientY: 10 });
    const reopened = within(screen.getByRole("menu"));
    await userEvent
      .setup()
      .click(reopened.getByRole("menuitem", { name: LABELS.de.addToStoryboard }));
    expect(store.getState().slides).toHaveLength(1);
  });

  it.each(LOCALES)("deletes a video tile after confirmation (%s)", async (locale) => {
    localStorage.setItem("mmy.locale", locale);
    const l = LABELS[locale];
    const user = userEvent.setup();
    const api = importApi([videoItem("clip"), videoItem("other", 60, "other.mp4")]);
    const { ready, store } = renderApp(api);
    await act(() => ready);
    act(() => store.getState().setCollection("video"));

    const tile = screen.getByRole("button", { name: l.tile });
    fireEvent.contextMenu(tile, { clientX: 10, clientY: 10 });
    const menu = screen.getByRole("menu", { name: l.menu });
    await user.click(within(menu).getByRole("menuitem", { name: l.del }));

    const dialog = screen.getByRole("dialog", { name: l.title });
    expect(dialog).toHaveTextContent(l.question);
    await user.click(within(dialog).getByRole("button", { name: l.yes }));

    await waitFor(() => expect(api.deleteMedia).toHaveBeenCalledWith("clip"));
    await waitFor(() => expect(tileLabels(l.video, l.videoList)).toEqual(["other.mp4, 1:00"]));
    expect(store.getState().media.map((m) => m.id)).toEqual(["other"]);
    // Focus moves to the neighbouring video tile.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "other.mp4, 1:00" })).toHaveFocus(),
    );
  });

  it("deletes a video tile with the Delete key", async () => {
    const user = userEvent.setup();
    const api = importApi([videoItem("clip")]);
    const { ready, store } = renderApp(api);
    await act(() => ready);
    act(() => store.getState().setCollection("video"));
    screen.getByRole("button", { name: LABELS.de.tile }).focus();
    await user.keyboard("{Delete}");
    await user.click(screen.getByRole("button", { name: "Ja" }));
    await waitFor(() => expect(store.getState().media).toEqual([]));
  });

  it(
    "deletes a video even while an export of another medium is running " +
      "(no media.inUseByExport check for video, design.md D5)",
    async () => {
      const user = userEvent.setup();
      // Unlike the picture/audio case, deleteMedia for a video never rejects
      // with 409 - the backend cannot reach that state since a video can never
      // be part of an exported project snapshot.
      const api = importApi([videoItem("clip")]);
      const { ready, store } = renderApp(api);
      await act(() => ready);
      act(() => store.getState().setCollection("video"));
      screen.getByRole("button", { name: LABELS.de.tile }).focus();
      await user.keyboard("{Delete}");
      await user.click(screen.getByRole("button", { name: "Ja" }));
      await waitFor(() => expect(api.deleteMedia).toHaveBeenCalledWith("clip"));
      expect(store.getState().media).toEqual([]);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("shows the translated reason if deleting a video is ever rejected", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      listMedia: vi.fn(async () => [videoItem("clip")]),
      deleteMedia: vi.fn(async () => {
        throw new ApiError("unexpected", 500, {
          code: "media.notFound",
          params: { mediaId: "clip" },
          message: "Medium not found",
        });
      }),
    });
    const { ready, store } = renderApp(api);
    await act(() => ready);
    act(() => store.getState().setCollection("video"));
    screen.getByRole("button", { name: LABELS.de.tile }).focus();
    await user.keyboard("{Delete}");
    await user.click(screen.getByRole("button", { name: "Ja" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("„clip.mp4“ konnte nicht gelöscht werden.");
    expect(alert).toHaveTextContent("Das Medium wurde nicht gefunden.");
  });
});
