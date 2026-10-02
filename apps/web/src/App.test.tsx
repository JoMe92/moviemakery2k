import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { APP_TITLE } from "./App";
import { STORYBOARD_EMPTY_HINT } from "./shell/StoryboardPane";
import { mockApi } from "./store/testApi";
import { renderApp } from "./test/renderApp";

describe("App-Shell", () => {
  it("zeigt alle Bereiche des Movie-Maker-Layouts", async () => {
    renderApp();

    const titlebar = screen.getByRole("banner");
    expect(within(titlebar).getByRole("heading", { level: 1 })).toHaveTextContent(APP_TITLE);

    const menubar = screen.getByRole("menubar", { name: "Menüleiste" });
    const menus = within(menubar)
      .getAllByRole("menuitem")
      .map((m) => m.textContent);
    expect(menus).toEqual([
      "Datei",
      "Bearbeiten",
      "Ansicht",
      "Extras",
      "Clip",
      "Wiedergabe",
      "Hilfe",
    ]);

    const toolbar = screen.getByRole("toolbar", { name: "Symbolleiste" });
    expect(within(toolbar).getByRole("combobox", { name: /Sammlungen/ })).toHaveValue("media");

    const tasks = screen.getByRole("complementary", { name: "Filmaufgaben" });
    for (const group of ["1. Aufnehmen", "2. Film bearbeiten", "3. Film fertig stellen"]) {
      expect(within(tasks).getByRole("button", { name: group })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    }

    expect(screen.getByRole("region", { name: "Sammlung: Meine Bilder" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Vorschau" })).toBeInTheDocument();
    const storyboard = screen.getByRole("region", { name: "Storyboard" });
    expect(within(storyboard).getByText(STORYBOARD_EMPTY_HINT)).toBeInTheDocument();
    expect(within(storyboard).getByRole("button", { name: "Zeitachse anzeigen" })).toBeDisabled();

    const statusbar = screen.getByRole("contentinfo");
    expect(await within(statusbar).findByText("Backend bereit · FFmpeg 9.0")).toBeInTheDocument();
  });

  it("zeigt nach dem Laden „Gespeichert“", async () => {
    renderApp();
    expect(await within(screen.getByRole("contentinfo")).findByText("Gespeichert")).toBeVisible();
  });

  it("meldet ein nicht erreichbares Backend in der Statusleiste", async () => {
    renderApp(
      mockApi({
        health: vi.fn(async () => {
          throw new TypeError("offline");
        }),
      }),
    );
    const statusbar = screen.getByRole("contentinfo");
    expect(await within(statusbar).findByText("Backend nicht erreichbar")).toBeInTheDocument();
  });

  it("markiert „Videoeffekte anzeigen“ als deaktiviert", () => {
    renderApp();
    expect(screen.getByRole("button", { name: "Videoeffekte anzeigen" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("schaltet über „Videoübergänge anzeigen“ die Sammlungsauswahl um", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Videoübergänge anzeigen" }));
    expect(screen.getByRole("combobox", { name: /Sammlungen/ })).toHaveValue("transitions");
    expect(screen.getByRole("region", { name: "Sammlung: Videoübergänge" })).toBeInTheDocument();
  });

  it("bewegt den Fokus in der Menüleiste mit den Pfeiltasten", async () => {
    const user = userEvent.setup();
    renderApp();
    const [datei, bearbeiten] = screen.getAllByRole("menuitem");
    expect(datei).toHaveAttribute("tabindex", "0");
    datei?.focus();
    await user.keyboard("{ArrowRight}");
    expect(bearbeiten).toHaveFocus();
    expect(bearbeiten).toHaveAttribute("tabindex", "0");
    expect(datei).toHaveAttribute("tabindex", "-1");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("menuitem", { name: "Hilfe" })).toHaveFocus();
  });
});
