import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/renderApp";
import { ABOUT_TEXT } from "./AppDialogs";

describe("Menüleiste", () => {
  it("öffnet ein Menü per Tastatur und navigiert mit den Pfeiltasten", async () => {
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

  it("deaktivierte Einträge sind markiert und lösen nichts aus", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    const undo = screen.getByRole("menuitem", { name: "Rückgängig" });
    expect(undo).toHaveAttribute("aria-disabled", "true");
    await user.click(undo);
    expect(screen.getByRole("menu", { name: "Bearbeiten" })).toBeInTheDocument();
  });

  it("Hilfe → Info zeigt den Hinweis zu Microsoft", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("menuitem", { name: "Hilfe" }));
    await user.click(screen.getByRole("menuitem", { name: "Info" }));
    const dialog = screen.getByRole("dialog", { name: "Info über moviemakerY2K" });
    expect(within(dialog).getByText(ABOUT_TEXT)).toBeInTheDocument();
  });

  it("Spec: Neues Projekt leert nach Rückfrage nur den Bildstreifen", async () => {
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

  it("Datei → In Sammlungen importieren fordert den Dateidialog an", async () => {
    const user = userEvent.setup();
    const { store } = renderApp();
    const before = store.getState().importRequest;
    await user.click(screen.getByRole("menuitem", { name: "Datei" }));
    await user.click(screen.getByRole("menuitem", { name: "In Sammlungen importieren…" }));
    expect(store.getState().importRequest).toBe(before + 1);
  });

  it("Bearbeiten → Löschen entfernt das gewählte Storyboard-Element", async () => {
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
});
