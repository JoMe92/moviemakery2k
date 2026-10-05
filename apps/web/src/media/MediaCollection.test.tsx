import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/apiClient";
import { slideMediaId } from "../store/projectOps";
import { mediaItem, mockApi, slideMediaIdOf } from "../store/testApi";
import { renderApp } from "../test/renderApp";

const file = (name: string, type = "image/jpeg") => new File(["x"], name, { type });

/** Upload mock that uses the file name as the display name. */
const uploaded = (f: File) => ({
  ok: true as const,
  filename: f.name,
  item: { ...mediaItem(f.name), filename: f.name },
});

function importApi(overrides: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    listMedia: vi.fn(async () => []),
    uploadMedia: vi.fn(async (f: File) => uploaded(f)),
    ...overrides,
  });
}

function collection() {
  return screen.getByRole("region", { name: "Sammlung: Meine Bilder" });
}

function tileNames(): string[] {
  const list = within(collection()).queryByRole("list", { name: "Bilder" });
  if (!list) return [];
  return within(list)
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? "");
}

describe("media collection", () => {
  it("shows loaded media as tiles in import order with a thumbnail", async () => {
    const { ready } = renderApp();
    await act(() => ready);
    expect(tileNames()).toEqual(["a.jpg", "b.jpg"]);
    const img = within(collection()).getByRole("img", { name: "a.jpg" });
    expect(img).toHaveAttribute("src", "/api/media/a/thumbnail");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("shows a hint for an empty collection", async () => {
    const { ready } = renderApp(importApi());
    await act(() => ready);
    expect(
      within(collection()).getByText(
        "Diese Sammlung ist leer. Wählen Sie „Bilder importieren“ oder ziehen Sie Bilder hierher.",
      ),
    ).toBeInTheDocument();
  });

  it("imports via the file dialog from “Import pictures” and shows new tiles", async () => {
    const user = userEvent.setup();
    const { ready, store, api } = renderApp(importApi());
    await act(() => ready);
    store.getState().setCollection("transitions");

    const input = screen.getByTestId("media-import-input") as HTMLInputElement;
    const clicked = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "Bilder importieren" }));
    expect(clicked).toHaveBeenCalledTimes(1);

    await user.upload(input, [file("eins.jpg"), file("zwei.jpg"), file("drei.jpg")]);
    await waitFor(() => expect(tileNames()).toEqual(["eins.jpg", "zwei.jpg", "drei.jpg"]));
    expect(store.getState().collection).toBe("media");
    expect(api.uploadMedia).toHaveBeenCalledTimes(3);
    // An error-free import clears the progress.
    await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
    expect(store.getState().uploads).toEqual([]);
  });

  it("also opens the file dialog via requestImport() (File menu)", async () => {
    const { ready, store } = renderApp();
    await act(() => ready);
    const clicked = vi.spyOn(screen.getByTestId("media-import-input"), "click");
    act(() => store.getState().requestImport());
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("shows the progress during the upload", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const api = importApi({
      uploadMedia: vi.fn(async (f: File) => {
        await gate;
        return uploaded(f);
      }),
    });
    const user = userEvent.setup();
    const { ready } = renderApp(api);
    await act(() => ready);
    await user.upload(screen.getByTestId("media-import-input"), [file("1.jpg"), file("2.jpg")]);
    expect(await screen.findByText("Importiere 1 von 2 …")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Importfortschritt" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    await act(async () => release());
    await waitFor(() => expect(tileNames()).toEqual(["1.jpg", "2.jpg"]));
  });

  it("reports partial failures per file and imports the rest", async () => {
    const api = importApi({
      uploadMedia: vi.fn(async (f: File) =>
        f.name === "kaputt.jpg"
          ? {
              ok: false as const,
              // A code outside the contract: the message is shown as-is.
              errorCode: "unsupported" as never,
              errorParams: {},
              filename: f.name,
              message: "Kein unterstütztes Bild.",
            }
          : uploaded(f),
      ),
    });
    const user = userEvent.setup();
    const { ready, store } = renderApp(api);
    await act(() => ready);
    await user.upload(screen.getByTestId("media-import-input"), [
      file("gut.jpg"),
      file("kaputt.jpg"),
      file("auch-gut.jpg"),
    ]);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("1 Datei wurde nicht importiert:");
    expect(within(alert).getByRole("listitem")).toHaveTextContent(
      "kaputt.jpg: Kein unterstütztes Bild.",
    );
    expect(tileNames()).toEqual(["gut.jpg", "auch-gut.jpg"]);

    await user.click(within(alert).getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(store.getState().uploads).toEqual([]);
  });

  it("imports by dropping files and highlights the area while dragging", async () => {
    const { ready, api } = renderApp(importApi());
    await act(() => ready);
    const pane = collection();
    const files = [file("x.png", "image/png"), file("y.png", "image/png")];
    const dataTransfer = { types: ["Files"], files, dropEffect: "none" };

    fireEvent.dragEnter(pane, { dataTransfer });
    expect(pane.className).toMatch(/dropping/);
    fireEvent.dragOver(pane, { dataTransfer });
    fireEvent.drop(pane, { dataTransfer });
    expect(pane.className).not.toMatch(/dropping/);

    await waitFor(() => expect(tileNames()).toEqual(["x.png", "y.png"]));
    expect(api.uploadMedia).toHaveBeenCalledTimes(2);
  });

  it("ignores drags without files (e.g. within the app)", async () => {
    const { ready, api } = renderApp();
    await act(() => ready);
    const pane = collection();
    const dataTransfer = { types: ["text/plain"], files: [] };
    fireEvent.dragEnter(pane, { dataTransfer });
    expect(pane.className).not.toMatch(/dropping/);
    fireEvent.drop(pane, { dataTransfer });
    expect(api.uploadMedia).not.toHaveBeenCalled();
  });

  it("deletes after confirmation via the Delete key", async () => {
    const user = userEvent.setup();
    const { ready, api } = renderApp();
    await act(() => ready);
    const tile = within(collection()).getByRole("button", { name: "a.jpg" });
    tile.focus();
    await user.keyboard("{Delete}");

    const dialog = screen.getByRole("dialog", { name: "Bild löschen" });
    expect(dialog).toHaveTextContent(
      "Möchten Sie „a.jpg“ wirklich löschen? Es wird auch aus dem Storyboard entfernt.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Ja" }));

    await waitFor(() => expect(tileNames()).toEqual(["b.jpg"]));
    expect(api.deleteMedia).toHaveBeenCalledWith("a");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the picture when the confirmation is declined", async () => {
    const user = userEvent.setup();
    const { ready, api } = renderApp();
    await act(() => ready);
    within(collection()).getByRole("button", { name: "b.jpg" }).focus();
    await user.keyboard("{Delete}");
    await user.click(screen.getByRole("button", { name: "Nein" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.deleteMedia).not.toHaveBeenCalled();
    expect(tileNames()).toEqual(["a.jpg", "b.jpg"]);
  });

  it("also removes the storyboard items on delete (cascade from the backend)", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      deleteMedia: vi.fn(async () => ({
        schemaVersion: 5 as const,
        music: [],
        slides: [
          {
            kind: "image" as const,
            id: "s3",
            mediaId: "b",
            duration: 4,
            effectId: null,
            title: null,
            transitionIn: null,
          },
        ],
      })),
    });
    const { ready, store } = renderApp(api);
    await act(() => ready);
    act(() => {
      store.getState().addSlide("a");
      store.getState().addSlide("b");
      store.getState().addSlide("a");
    });
    within(collection()).getByRole("button", { name: "a.jpg" }).focus();
    await user.keyboard("{Delete}");
    await user.click(screen.getByRole("button", { name: "Ja" }));
    await waitFor(() => expect(store.getState().slides.map((s) => slideMediaId(s))).toEqual(["b"]));
  });

  it.each([
    [
      "de",
      { collection: "Sammlung: Meine Bilder", pictures: "Bilder", strip: "Bildstreifen" },
      { title: "Bild löschen", yes: "Ja", ok: "OK" },
      "„a.jpg“ konnte nicht gelöscht werden.",
      "Das Medium kann nicht gelöscht werden, solange es exportiert wird. Bitte warten, bis der Export fertig ist, oder ihn zuerst abbrechen.",
    ],
    [
      "en",
      { collection: "Collection: My Pictures", pictures: "Pictures", strip: "Storyboard strip" },
      { title: "Delete Picture", yes: "Yes", ok: "OK" },
      "“a.jpg” could not be deleted.",
      "The medium cannot be deleted while it is being exported. Wait for the export to finish or cancel it first.",
    ],
  ])(
    "keeps the picture in collection and storyboard when a running export uses it (%s)",
    async (locale, regions, labels, failed, reason) => {
      localStorage.setItem("mmy.locale", locale);
      const user = userEvent.setup();
      const api = mockApi({
        getProject: vi.fn(async () => ({
          schemaVersion: 5 as const,
          music: [],
          slides: [
            {
              kind: "image" as const,
              id: "s1",
              mediaId: "a",
              duration: 4,
              effectId: null,
              title: null,
              transitionIn: null,
            },
            {
              kind: "image" as const,
              id: "s2",
              mediaId: "b",
              duration: 4,
              effectId: null,
              title: null,
              transitionIn: null,
            },
          ],
        })),
        deleteMedia: vi.fn(async () => {
          throw new ApiError("Medium is used by a running export", 409, {
            code: "media.inUseByExport",
            params: { mediaId: "a", exportId: "job-1" },
            message: "Medium is used by a running export",
          });
        }),
      });
      const { ready, store } = renderApp(api);
      await act(() => ready);
      const pane = screen.getByRole("region", { name: regions.collection });
      const names = () =>
        within(within(pane).getByRole("list", { name: regions.pictures }))
          .getAllByRole("button")
          .map((b) => b.getAttribute("aria-label"));
      const stripLabels = () =>
        within(screen.getByRole("list", { name: regions.strip }))
          .getAllByRole("button")
          .map((b) => b.getAttribute("aria-label"));
      const slidesBefore = store.getState().slides;
      const stripBefore = stripLabels();
      expect(stripBefore.length).toBeGreaterThan(0);

      within(pane).getByRole("button", { name: "a.jpg" }).focus();
      await user.keyboard("{Delete}");
      const confirm = screen.getByRole("dialog", { name: labels.title });
      await user.click(within(confirm).getByRole("button", { name: labels.yes }));

      const error = await screen.findByRole("dialog", { name: labels.title });
      const alert = within(error).getByRole("alert");
      expect(alert).toHaveTextContent(failed);
      expect(alert).toHaveTextContent(reason);
      expect(api.deleteMedia).toHaveBeenCalledWith("a");

      // Nothing was removed: collection, storyboard state and strip are unchanged.
      expect(names()).toEqual(["a.jpg", "b.jpg"]);
      expect(store.getState().media.map((m) => m.id)).toEqual(["a", "b"]);
      expect(store.getState().slides).toEqual(slidesBefore);
      expect(stripLabels()).toEqual(stripBefore);

      await user.click(within(error).getByRole("button", { name: labels.ok }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(names()).toEqual(["a.jpg", "b.jpg"]);
    },
  );

  it("shows a generic message when deleting fails without a structured error", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      deleteMedia: vi.fn(async () => {
        throw new TypeError("offline");
      }),
    });
    const { ready } = renderApp(api);
    await act(() => ready);
    within(collection()).getByRole("button", { name: "b.jpg" }).focus();
    await user.keyboard("{Delete}");
    await user.click(screen.getByRole("button", { name: "Ja" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/^„b\.jpg“ konnte nicht gelöscht werden\.$/);
    expect(tileNames()).toEqual(["a.jpg", "b.jpg"]);
  });

  it("deletes via the context menu and adds to the storyboard through it", async () => {
    const user = userEvent.setup();
    const { ready, api, store } = renderApp();
    await act(() => ready);
    const tile = within(collection()).getByRole("button", { name: "b.jpg" });

    fireEvent.contextMenu(tile, { clientX: 20, clientY: 30 });
    let menu = screen.getByRole("menu", { name: "Bild „b.jpg“" });
    expect(within(menu).getAllByRole("menuitem")[0]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(tile).toHaveFocus();

    fireEvent.contextMenu(tile, { clientX: 20, clientY: 30 });
    menu = screen.getByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Zum Storyboard hinzufügen" }));
    expect(store.getState().slides.map((s) => slideMediaId(s))).toEqual(["b"]);

    fireEvent.contextMenu(tile, { clientX: 20, clientY: 30 });
    await user.keyboard("{ArrowDown}{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Bild löschen" });
    await user.click(within(dialog).getByRole("button", { name: "Ja" }));
    await waitFor(() => expect(tileNames()).toEqual(["a.jpg"]));
    expect(api.deleteMedia).toHaveBeenCalledWith("b");
  });

  it("appends the picture to the storyboard by double-click", async () => {
    const user = userEvent.setup();
    const { ready, store } = renderApp();
    await act(() => ready);
    await user.dblClick(within(collection()).getByRole("button", { name: "a.jpg" }));
    expect(store.getState().slides).toHaveLength(1);
    expect(slideMediaIdOf(store.getState().slides[0])).toBe("a");
  });

  it("shows import texts and the offline error in English", async () => {
    localStorage.setItem("mmy.locale", "en");
    const api = importApi({
      uploadMedia: vi.fn(async () => {
        throw new TypeError("offline");
      }),
    });
    const user = userEvent.setup();
    const { ready } = renderApp(api);
    await act(() => ready);
    const pane = screen.getByRole("region", { name: "Collection: My Pictures" });
    expect(pane).toHaveTextContent(
      "This collection is empty. Choose “Import pictures” or drag pictures here.",
    );
    await user.upload(screen.getByTestId("media-import-input"), [file("a.jpg"), file("b.jpg")]);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("2 files were not imported:");
    expect(within(alert).getAllByRole("listitem")[0]).toHaveTextContent(
      "a.jpg: Backend not reachable.",
    );
    expect(within(alert).getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it.each([
    [
      "de",
      "kaputt.gif: Keine unterstützte Bild-, Video- oder Audiodatei (erlaubt sind JPEG, PNG, WebP, MP4/MOV und MKV/WebM (H.264, HEVC, VP9 oder AV1), MP3, WAV, M4A/AAC, OGG und FLAC).",
    ],
    [
      "en",
      "kaputt.gif: Not a supported image, video or audio file (allowed are JPEG, PNG, WebP, MP4/MOV and MKV/WebM (H.264, HEVC, VP9 or AV1), MP3, WAV, M4A/AAC, OGG and FLAC).",
    ],
  ])("translates the code media.unsupportedType per file (%s)", async (locale, text) => {
    localStorage.setItem("mmy.locale", locale);
    const api = importApi({
      uploadMedia: vi.fn(async (f: File) => ({
        ok: false as const,
        errorCode: "media.unsupportedType" as const,
        errorParams: {},
        filename: f.name,
        message:
          "Not a supported image, video or audio file (allowed are JPEG, PNG, WebP, MP4/MOV and MKV/WebM (H.264, HEVC, VP9 or AV1), MP3, WAV, M4A/AAC, OGG and FLAC).",
      })),
    });
    const user = userEvent.setup();
    const { ready } = renderApp(api);
    await act(() => ready);
    await user.upload(screen.getByTestId("media-import-input"), [file("kaputt.gif")]);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("listitem")).toHaveTextContent(text);
  });

  it("shows the translated code for 413 (too many files)", async () => {
    const api = importApi({
      uploadMedia: vi.fn(async () => {
        throw new ApiError("Too many files", 413, {
          code: "media.tooManyFiles",
          params: { max: 50, count: 51 },
          message: "Too many files: at most 50 per import (51 sent).",
        });
      }),
    });
    const user = userEvent.setup();
    const { ready } = renderApp(api);
    await act(() => ready);
    await user.upload(screen.getByTestId("media-import-input"), [file("a.jpg")]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "a.jpg: Zu viele Dateien: höchstens 50 je Import (51 gesendet).",
    );
  });
});
