import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LOCALE_STORAGE_KEY } from "../i18n/locale";
import { createAppStore } from "../store/appStore";
import { mockApi } from "../store/testApi";
import { renderApp } from "../test/renderApp";

async function openOptionsWithMouse(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("menuitem", { name: "Extras" }));
  await user.click(screen.getByRole("menuitem", { name: "Optionen…" }));
  return screen.getByRole("dialog", { name: /^(Optionen|Options)$/ });
}

describe("Optionen-Dialog", () => {
  it("Spec: öffnet per Maus mit der aktuellen Sprache ausgewählt", async () => {
    const user = userEvent.setup();
    renderApp();
    const dialog = await openOptionsWithMouse(user);
    expect(within(dialog).getByRole("radio", { name: "Deutsch" })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: "English" })).not.toBeChecked();
  });

  it("öffnet per Tastatur", async () => {
    const user = userEvent.setup();
    renderApp();
    screen.getByRole("menuitem", { name: "Extras" }).focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu", { name: "Extras" });
    await user.keyboard("{End}");
    await waitFor(() =>
      expect(within(menu).getByRole("menuitem", { name: "Optionen…" })).toHaveFocus(),
    );
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Optionen" });
    // Choose English with the keyboard and confirm.
    within(dialog).getByRole("radio", { name: "Deutsch" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(within(dialog).getByRole("radio", { name: "English" })).toBeChecked();
    await user.keyboard("{Tab}{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("Spec: OK wechselt sofort, ohne den Bildstreifen zu ändern, und speichert die Wahl", async () => {
    const user = userEvent.setup();
    const { store, ready } = renderApp();
    await ready;
    store.getState().addSlide("a");
    const slides = store.getState().slides;
    const dialog = await openOptionsWithMouse(user);
    await user.click(within(dialog).getByRole("radio", { name: "English" }));
    await user.click(within(dialog).getByRole("button", { name: "OK" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(store.getState().locale).toBe("en");
    expect(store.getState().slides).toBe(slides);
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");

    // The dialog itself now appears in English, still naming each language in itself.
    // The Tools menu itself is localized in a later task, so it is still German here.
    await openOptionsWithMouse(user);
    const english = screen.getByRole("dialog", { name: "Options" });
    expect(within(english).getByRole("radio", { name: "English" })).toBeChecked();
    expect(within(english).getByRole("radio", { name: "Deutsch" })).toBeInTheDocument();
    expect(within(english).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("Spec: Abbrechen schließt ohne Änderung", async () => {
    const user = userEvent.setup();
    const { store } = renderApp();
    const dialog = await openOptionsWithMouse(user);
    await user.click(within(dialog).getByRole("radio", { name: "English" }));
    await user.click(within(dialog).getByRole("button", { name: "Abbrechen" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(store.getState().locale).toBe("de");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("de");
    // Reopening starts again from the current language.
    const again = await openOptionsWithMouse(user);
    expect(within(again).getByRole("radio", { name: "Deutsch" })).toBeChecked();
  });

  it("Spec: die gewählte Sprache bleibt nach einem Neuladen erhalten", async () => {
    const user = userEvent.setup();
    renderApp();
    const dialog = await openOptionsWithMouse(user);
    await user.click(within(dialog).getByRole("radio", { name: "English" }));
    await user.click(within(dialog).getByRole("button", { name: "OK" }));

    // A reload creates a fresh store; it must start with the stored language,
    // even though the browser language is German.
    Object.defineProperty(navigator, "languages", { configurable: true, value: ["de-DE"] });
    try {
      expect(createAppStore(mockApi()).getState().locale).toBe("en");
    } finally {
      Reflect.deleteProperty(navigator, "languages");
    }
  });
});
