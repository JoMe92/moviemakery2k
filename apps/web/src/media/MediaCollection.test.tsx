import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mediaItem, mockApi } from "../store/testApi";
import { renderApp } from "../test/renderApp";
import { deleteQuestion, MEDIA_EMPTY_HINT } from "./MediaCollection";

const file = (name: string, type = "image/jpeg") => new File(["x"], name, { type });

/** Upload-Mock, der den Dateinamen als Anzeigenamen übernimmt. */
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

describe("Mediensammlung", () => {
  it("zeigt geladene Medien als Kacheln in Importreihenfolge mit Vorschaubild", async () => {
    const { ready } = renderApp();
    await act(() => ready);
    expect(tileNames()).toEqual(["a.jpg", "b.jpg"]);
    const img = within(collection()).getByRole("img", { name: "a.jpg" });
    expect(img).toHaveAttribute("src", "/api/media/a/thumbnail");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("zeigt einen Hinweis bei leerer Sammlung", async () => {
    const { ready } = renderApp(importApi());
    await act(() => ready);
    expect(within(collection()).getByText(MEDIA_EMPTY_HINT)).toBeInTheDocument();
  });

  it("importiert per Dateidialog über „Bilder importieren“ und zeigt neue Kacheln", async () => {
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
    // Fehlerfreier Import räumt den Fortschritt ab.
    await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
    expect(store.getState().uploads).toEqual([]);
  });

  it("öffnet den Dateidialog auch über requestImport() (Datei-Menü)", async () => {
    const { ready, store } = renderApp();
    await act(() => ready);
    const clicked = vi.spyOn(screen.getByTestId("media-import-input"), "click");
    act(() => store.getState().requestImport());
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("zeigt den Fortschritt während des Uploads", async () => {
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

  it("meldet Teilfehler je Datei und importiert die übrigen", async () => {
    const api = importApi({
      uploadMedia: vi.fn(async (f: File) =>
        f.name === "kaputt.jpg"
          ? {
              ok: false as const,
              error: "unsupported" as const,
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

  it("importiert per Drop von Dateien und hebt den Bereich beim Ziehen hervor", async () => {
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

  it("ignoriert Drags ohne Dateien (z. B. innerhalb der App)", async () => {
    const { ready, api } = renderApp();
    await act(() => ready);
    const pane = collection();
    const dataTransfer = { types: ["text/plain"], files: [] };
    fireEvent.dragEnter(pane, { dataTransfer });
    expect(pane.className).not.toMatch(/dropping/);
    fireEvent.drop(pane, { dataTransfer });
    expect(api.uploadMedia).not.toHaveBeenCalled();
  });

  it("löscht nach Bestätigung über die Entf-Taste", async () => {
    const user = userEvent.setup();
    const { ready, api } = renderApp();
    await act(() => ready);
    const tile = within(collection()).getByRole("button", { name: "a.jpg" });
    tile.focus();
    await user.keyboard("{Delete}");

    const dialog = screen.getByRole("dialog", { name: "Bild löschen" });
    expect(dialog).toHaveTextContent(deleteQuestion("a.jpg"));
    await user.click(within(dialog).getByRole("button", { name: "Ja" }));

    await waitFor(() => expect(tileNames()).toEqual(["b.jpg"]));
    expect(api.deleteMedia).toHaveBeenCalledWith("a");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("behält das Bild, wenn die Rückfrage verneint wird", async () => {
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

  it("entfernt beim Löschen auch die Storyboard-Elemente (Kaskade aus dem Backend)", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      deleteMedia: vi.fn(async () => ({
        schemaVersion: 1 as const,
        slides: [{ id: "s3", mediaId: "b", duration: 4, transitionIn: null }],
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
    await waitFor(() => expect(store.getState().slides.map((s) => s.mediaId)).toEqual(["b"]));
  });

  it("löscht über das Kontextmenü und fügt darüber zum Storyboard hinzu", async () => {
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
    expect(store.getState().slides.map((s) => s.mediaId)).toEqual(["b"]);

    fireEvent.contextMenu(tile, { clientX: 20, clientY: 30 });
    await user.keyboard("{ArrowDown}{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Bild löschen" });
    await user.click(within(dialog).getByRole("button", { name: "Ja" }));
    await waitFor(() => expect(tileNames()).toEqual(["a.jpg"]));
    expect(api.deleteMedia).toHaveBeenCalledWith("b");
  });

  it("hängt das Bild per Doppelklick ans Storyboard an", async () => {
    const user = userEvent.setup();
    const { ready, store } = renderApp();
    await act(() => ready);
    await user.dblClick(within(collection()).getByRole("button", { name: "a.jpg" }));
    expect(store.getState().slides).toHaveLength(1);
    expect(store.getState().slides[0]?.mediaId).toBe("a");
  });
});
