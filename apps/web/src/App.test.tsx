import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockApi } from "./store/testApi";
import { renderApp } from "./test/renderApp";

describe("App shell", () => {
  it("shows all areas of the Movie Maker layout", async () => {
    renderApp();

    const titlebar = screen.getByRole("banner");
    expect(within(titlebar).getByRole("heading", { level: 1 })).toHaveTextContent(
      "moviemakerY2K – Unbenanntes Projekt",
    );

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
    expect(
      within(storyboard).getByText("Ziehen Sie Bilder hierher, um eine Diashow zu erstellen."),
    ).toBeInTheDocument();
    expect(within(storyboard).getByRole("button", { name: "Zeitachse anzeigen" })).toBeDisabled();

    const statusbar = screen.getByRole("contentinfo");
    expect(await within(statusbar).findByText("Backend bereit · FFmpeg 9.0")).toBeInTheDocument();
  });

  it("shows 'Gespeichert' after loading", async () => {
    renderApp();
    expect(await within(screen.getByRole("contentinfo")).findByText("Gespeichert")).toBeVisible();
  });

  it("reports an unreachable backend in the status bar", async () => {
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

  it("marks 'Videoeffekte anzeigen' as disabled", () => {
    renderApp();
    expect(screen.getByRole("button", { name: "Videoeffekte anzeigen" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("switches the collection picker via 'Videoübergänge anzeigen'", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("button", { name: "Videoübergänge anzeigen" }));
    expect(screen.getByRole("combobox", { name: /Sammlungen/ })).toHaveValue("transitions");
    expect(screen.getByRole("region", { name: "Sammlung: Videoübergänge" })).toBeInTheDocument();
  });

  it("moves focus in the menu bar with the arrow keys", async () => {
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

  it("Spec localization: shows the shell in English", async () => {
    localStorage.setItem("mmy.locale", "en");
    const { ready } = renderApp();
    await ready;

    expect(document.documentElement.lang).toBe("en");
    const titlebar = screen.getByRole("banner");
    expect(within(titlebar).getByRole("heading", { level: 1 })).toHaveTextContent(
      "moviemakerY2K – Untitled Project",
    );
    const menubar = screen.getByRole("menubar", { name: "Menu bar" });
    expect(
      within(menubar)
        .getAllByRole("menuitem")
        .map((m) => m.textContent),
    ).toEqual(["File", "Edit", "View", "Tools", "Clip", "Play", "Help"]);

    const tasks = screen.getByRole("complementary", { name: "Movie Tasks" });
    for (const group of ["1. Capture Video", "2. Edit Movie", "3. Finish Movie"]) {
      expect(within(tasks).getByRole("button", { name: group })).toBeInTheDocument();
    }
    expect(within(tasks).getByRole("button", { name: "Save to my computer" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Toolbar" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Collections/ })).toHaveValue("media");
    expect(screen.getByRole("region", { name: "Collection: My Pictures" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByText("Drag pictures here to create a slide show.")).toBeInTheDocument();
    expect(
      await within(screen.getByRole("contentinfo")).findByText("Backend ready · FFmpeg 9.0"),
    ).toBeInTheDocument();
  });
});
