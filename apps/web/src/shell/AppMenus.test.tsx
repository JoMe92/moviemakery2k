import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { audioItem, mediaItem, mockApi } from "../store/testApi";
import { renderApp } from "../test/renderApp";

describe("Menu bar", () => {
  it("opens a menu by keyboard and navigates with the arrow keys", async () => {
    const user = userEvent.setup();
    renderApp();
    const datei = screen.getByRole("menuitem", { name: "Datei" });
    datei.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu", { name: "Datei" });
    await waitFor(() =>
      expect(within(menu).getByRole("menuitem", { name: "Neues Projekt" })).toHaveFocus(),
    );
    await user.keyboard("{ArrowDown}");
    expect(within(menu).getByRole("menuitem", { name: "Projekt öffnen…" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(datei).toHaveFocus();
  });

  it("disabled items are marked and trigger nothing", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    const undo = screen.getByRole("menuitem", { name: "Rückgängig" });
    expect(undo).toHaveAttribute("aria-disabled", "true");
    await user.click(undo);
    expect(screen.getByRole("menu", { name: "Bearbeiten" })).toBeInTheDocument();
  });

  it("Edit → Undo/Redo via the menu and Strg+Z/Strg+Y (spec edit-commands)", async () => {
    const user = userEvent.setup();
    const { store, ready } = renderApp();
    await ready;
    store.getState().addSlide("a");
    store.getState().addSlide("b");
    expect(store.getState().slides).toHaveLength(2);

    await user.keyboard("{Control>}z{/Control}");
    expect(store.getState().slides).toHaveLength(1);

    await user.click(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    const redo = screen.getByRole("menuitem", { name: "Wiederholen" });
    expect(redo).not.toHaveAttribute("aria-disabled");
    await user.click(redo);
    expect(store.getState().slides).toHaveLength(2);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.keyboard("{Control>}z{/Control}");
    expect(store.getState().slides).toHaveLength(1);
    await user.keyboard("{Control>}y{/Control}");
    expect(store.getState().slides).toHaveLength(2);
  });

  it("Edit → Cut/Copy/Paste via the menu and Strg+X/C/V (spec edit-commands)", async () => {
    const user = userEvent.setup();
    const { store, ready } = renderApp();
    await ready;
    store.getState().addSlide("a");
    const id = store.getState().slides[0]?.id ?? "";
    store.getState().select({ kind: "slide", slideId: id });

    await user.keyboard("{Control>}c{/Control}");
    expect(store.getState().clipboard).toEqual({ kind: "slide", mediaId: "a", duration: 5 });

    await user.click(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    const paste = screen.getByRole("menuitem", { name: "Einfügen" });
    expect(paste).not.toHaveAttribute("aria-disabled");
    await user.click(paste);
    expect(store.getState().slides).toHaveLength(2);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.keyboard("{Control>}x{/Control}");
    expect(store.getState().slides).toHaveLength(1);
    await user.keyboard("{Control>}v{/Control}");
    expect(store.getState().slides).toHaveLength(2);
  });

  it("Edit → Copy/Paste follow a music clip selection to the music track", async () => {
    const user = userEvent.setup();
    const { store, ready } = renderApp(
      mockApi({ listMedia: vi.fn(async () => [mediaItem("a"), audioItem("song")]) }),
    );
    await ready;
    store.getState().addMusicClip("song");
    const clipId = store.getState().music[0]?.id ?? "";
    store.getState().selectMusicClip(clipId);

    await user.click(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    const copy = screen.getByRole("menuitem", { name: "Kopieren" });
    expect(copy).not.toHaveAttribute("aria-disabled");
    await user.click(copy);
    expect(store.getState().clipboard?.kind).toBe("musicClip");

    await user.click(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    await user.click(screen.getByRole("menuitem", { name: "Einfügen" }));
    expect(store.getState().music).toHaveLength(2);
  });

  it("Ausschneiden/Kopieren/Einfügen are disabled without a selection or an empty clipboard", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    for (const name of ["Ausschneiden", "Kopieren", "Einfügen"]) {
      expect(screen.getByRole("menuitem", { name })).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("Strg+Z is ignored while focus is in an input field (e.g. the duration dialog)", async () => {
    const user = userEvent.setup();
    const { store, ready } = renderApp();
    await ready;
    store.getState().addSlide("a");
    const before = store.getState().slides;

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    await user.keyboard("{Control>}z{/Control}");
    expect(store.getState().slides).toBe(before);
    input.remove();
  });

  it("Help → About shows the Microsoft notice", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("menuitem", { name: "Hilfe" }));
    await user.click(screen.getByRole("menuitem", { name: "Info" }));
    const dialog = screen.getByRole("dialog", { name: "Info über moviemakerY2K" });
    expect(
      within(dialog).getByText(
        "moviemakerY2K ist vom klassischen Movie Maker inspiriert. Es ist kein Microsoft-Produkt und steht in keiner Verbindung zu Microsoft.",
      ),
    ).toBeInTheDocument();
  });

  it("Spec: New Project clears only the storyboard after confirmation", async () => {
    const user = userEvent.setup();
    const { store, ready } = renderApp();
    await ready;
    store.getState().addSlide("a");
    store.getState().addSlide("b");
    await user.click(screen.getByRole("menuitem", { name: "Datei" }));
    await user.click(screen.getByRole("menuitem", { name: "Neues Projekt" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Neues Projekt" })).getByRole("button", {
        name: "Ja",
      }),
    );
    expect(store.getState().slides).toEqual([]);
    expect(store.getState().media).toHaveLength(2);
    await store.getState().flushSave();
    expect(store.getState().saveState).toBe("saved");
  });

  it("File → Import into Collections requests the file dialog", async () => {
    const user = userEvent.setup();
    const { store } = renderApp();
    const before = store.getState().importRequest;
    await user.click(screen.getByRole("menuitem", { name: "Datei" }));
    await user.click(screen.getByRole("menuitem", { name: "In Sammlungen importieren…" }));
    expect(store.getState().importRequest).toBe(before + 1);
  });

  it("Edit → Delete removes the selected storyboard item", async () => {
    const user = userEvent.setup();
    const { store, ready } = renderApp();
    await ready;
    store.getState().addSlide("a");
    const id = store.getState().slides[0]?.id ?? "";
    store.getState().select({ kind: "slide", slideId: id });
    await user.click(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    await user.click(screen.getByRole("menuitem", { name: /Löschen/ }));
    expect(store.getState().slides).toEqual([]);
  });

  it("shows menu items and dialogs in English", async () => {
    localStorage.setItem("mmy.locale", "en");
    const user = userEvent.setup();
    const { ready, store } = renderApp();
    await ready;
    store.getState().addSlide("a");
    await user.click(screen.getByRole("menuitem", { name: "File" }));
    const file = screen.getByRole("menu", { name: "File" });
    expect(
      within(file)
        .getAllByRole("menuitem")
        .map((m) => m.textContent),
    ).toEqual([
      "New Project",
      "Open Project…",
      "Save Project",
      "Import into Collections…",
      "Save Movie…",
      "Exit",
    ]);
    await user.click(within(file).getByRole("menuitem", { name: "New Project" }));
    const confirm = screen.getByRole("dialog", { name: "New Project" });
    expect(within(confirm).getByRole("button", { name: "Yes" })).toBeInTheDocument();
    expect(within(confirm).getByRole("button", { name: "Close dialog" })).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "No" }));
    expect(store.getState().slides).toHaveLength(1);

    await user.click(screen.getByRole("menuitem", { name: "Help" }));
    await user.click(screen.getByRole("menuitem", { name: "About" }));
    const about = screen.getByRole("dialog", { name: "About moviemakerY2K" });
    expect(within(about).getByText(/is not a Microsoft product/)).toBeInTheDocument();
  });
});
