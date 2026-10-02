import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/apiClient";
import { STORYBOARD_EMPTY_HINT } from "../shell/StoryboardPane";
import { mockApi } from "../store/testApi";
import { renderApp } from "../test/renderApp";

const slide = (id: string, mediaId: string, duration = 5, t: string | null = null): Slide => ({
  id,
  mediaId,
  duration,
  transitionIn: t ? { transitionId: t, duration: 1.25 } : null,
});

async function setup(slides: Slide[]) {
  const api = mockApi({ getProject: vi.fn(async () => ({ schemaVersion: 1 as const, slides })) });
  const view = renderApp(api);
  await act(() => view.ready);
  return view;
}

const storyboard = () => screen.getByRole("region", { name: "Storyboard" });
const strip = () => within(storyboard()).getByRole("list", { name: "Bildstreifen" });
const tileLabels = () =>
  within(strip())
    .getAllByRole("button", { name: /^Bild \d+:/ })
    .map((b) => b.getAttribute("aria-label"));

/*
 * jsdom hat kein Layout: für die Tastatur-Sensoren von dnd-kit bekommen
 * Bildstreifen, Storyboard-Kacheln und Sammlungskacheln feste Rechtecke.
 */
function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

let restoreRects: (() => void) | null = null;
beforeEach(() => {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const label = this.getAttribute("aria-label") ?? "";
    const slideMatch = /^Bild (\d+):/.exec(label);
    if (slideMatch) return rect(20 + (Number(slideMatch[1]) - 1) * 160, 520, 104, 100);
    if (this.getAttribute("data-testid") === "storyboard-strip") return rect(0, 500, 1200, 150);
    // DragOverlay: liegt anfangs über der gezogenen (fokussierten) Kachel.
    const isOverlay =
      this.getAttribute("data-testid") === "drag-overlay" ||
      this.querySelector(":scope > [data-testid='drag-overlay']") !== null;
    const focused = document.activeElement;
    if (isOverlay && focused && focused !== this && focused !== document.body) {
      return focused.getBoundingClientRect();
    }
    const li = this.closest("ul[aria-label='Bilder'] > li");
    if (li && this.tagName === "BUTTON") {
      const index = Array.from(li.parentElement?.children ?? []).indexOf(li);
      return rect(20 + index * 100, 100, 96, 90);
    }
    return original.call(this);
  };
  restoreRects = () => {
    Element.prototype.getBoundingClientRect = original;
  };
});
afterEach(() => restoreRects?.());

/** Kleine Pause, damit dnd-kit messen und Listener anhängen kann. */
const tick = () => act(() => new Promise((r) => setTimeout(r, 20)));

describe("Storyboard", () => {
  it("zeigt den Hinweis, solange der Bildstreifen leer ist", async () => {
    await setup([]);
    expect(within(storyboard()).getByText(STORYBOARD_EMPTY_HINT)).toBeInTheDocument();
  });

  it("zeigt Kacheln mit Nummer, Dauer, Thumbnail, deaktiviertem Effekt-Platz und Übergangsplätzen", async () => {
    await setup([slide("s1", "a"), slide("s2", "b", 2.5, "circle"), slide("s3", "a", 0.75)]);
    expect(tileLabels()).toEqual([
      "Bild 1: a.jpg, 5,00 s",
      "Bild 2: b.jpg, 2,50 s",
      "Bild 3: a.jpg, 0,75 s",
    ]);
    const second = within(strip()).getByRole("button", { name: /^Bild 2:/ });
    expect(second).toHaveTextContent("2");
    expect(second).toHaveTextContent("2,50 s");
    expect(second.querySelector("img")).toHaveAttribute("src", "/api/media/b/thumbnail");

    const effect = within(strip()).getByRole("button", { name: "Effekt-Platz für Bild 2" });
    expect(effect).toHaveAttribute("aria-disabled", "true");
    expect(effect).toHaveAttribute("title", "Videoeffekte folgen später");

    // Übergangsplätze nur zwischen Kacheln; der Übergang gehört zum Zielbild.
    expect(within(strip()).queryByRole("group", { name: "Übergang vor Bild 1" })).toBeNull();
    expect(within(strip()).getByRole("group", { name: "Übergang vor Bild 2" })).toHaveTextContent(
      "Kreis",
    );
    expect(within(strip()).getByRole("group", { name: "Übergang vor Bild 3" })).toHaveTextContent(
      "–",
    );
    expect(screen.getByTestId("transition-slot-s3")).toBeInTheDocument();
  });

  it("wählt per Klick aus und entfernt mit Entf", async () => {
    const user = userEvent.setup();
    const { store } = await setup([slide("s1", "a"), slide("s2", "b", 5, "fade")]);
    const first = within(strip()).getByRole("button", { name: /^Bild 1:/ });
    await user.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(store.getState().selection).toEqual({ kind: "slide", slideId: "s1" });

    await user.keyboard("{Delete}");
    expect(store.getState().slides.map((s) => s.id)).toEqual(["s2"]);
    // Neues erstes Element verliert seinen eingehenden Übergang.
    expect(store.getState().slides[0]?.transitionIn).toBeNull();
    expect(tileLabels()).toEqual(["Bild 1: b.jpg, 5,00 s"]);
    expect(store.getState().selection).toEqual({ kind: "slide", slideId: "s2" });
  });

  it("entfernt über das Kontextmenü; „Eigenschaften…“ ist noch deaktiviert", async () => {
    const user = userEvent.setup();
    const { store } = await setup([slide("s1", "a"), slide("s2", "b")]);
    const second = within(strip()).getByRole("button", { name: /^Bild 2:/ });
    fireEvent.contextMenu(second, { clientX: 50, clientY: 50 });
    const menu = screen.getByRole("menu", { name: "Bild 2 des Storyboards" });
    expect(within(menu).getByRole("menuitem", { name: "Eigenschaften…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(within(menu).getByRole("menuitem", { name: "Entfernen" }));
    expect(store.getState().slides.map((s) => s.id)).toEqual(["s1"]);
  });

  it("entfernt die Auswahl über Bearbeiten → Löschen", async () => {
    const user = userEvent.setup();
    const { store } = await setup([slide("s1", "a"), slide("s2", "b")]);
    await user.click(within(strip()).getByRole("button", { name: /^Bild 2:/ }));
    await user.click(screen.getByRole("menuitem", { name: "Bearbeiten" }));
    await user.click(screen.getByRole("menuitem", { name: /^Löschen/ }));
    expect(store.getState().slides.map((s) => s.id)).toEqual(["s1"]);
  });

  it("sortiert per Tastatur um: drittes Element an Position 1 (Übergang entfällt dort)", async () => {
    const user = userEvent.setup();
    const { store } = await setup([
      slide("s1", "a"),
      slide("s2", "b", 5, "fade"),
      slide("s3", "a", 5, "circle"),
    ]);
    within(strip())
      .getByRole("button", { name: /^Bild 3:/ })
      .focus();
    await user.keyboard("[Space]");
    await tick();
    await user.keyboard("[ArrowLeft]");
    await tick();
    await user.keyboard("[ArrowLeft]");
    await tick();
    await user.keyboard("[Space]");
    await tick();
    const slides = store.getState().slides;
    expect(slides.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);
    expect(slides[0]?.transitionIn).toBeNull();
    expect(slides[2]?.transitionIn?.transitionId).toBe("fade");
  });

  it("fügt ein Bild aus der Sammlung per Tastatur an der Einfügemarke ein", async () => {
    const user = userEvent.setup();
    const { store } = await setup([slide("s1", "a"), slide("s2", "a")]);
    const collection = screen.getByRole("region", { name: "Sammlung: Meine Bilder" });
    within(collection).getByRole("button", { name: "b.jpg" }).focus();
    await user.keyboard("[Space]");
    await tick();
    await user.keyboard("[ArrowDown]"); // ans Ende des Bildstreifens
    await tick();
    expect(screen.getAllByTestId("insert-marker")).toHaveLength(1);
    await user.keyboard("[ArrowLeft]"); // zwischen Bild 1 und Bild 2
    await tick();
    await user.keyboard("[Space]");
    await tick();
    expect(store.getState().slides.map((s) => s.mediaId)).toEqual(["a", "b", "a"]);
    expect(screen.queryByTestId("insert-marker")).toBeNull();
  });

  it("fügt per Tastatur in einen leeren Bildstreifen ein", async () => {
    const user = userEvent.setup();
    const { store } = await setup([]);
    const collection = screen.getByRole("region", { name: "Sammlung: Meine Bilder" });
    within(collection).getByRole("button", { name: "a.jpg" }).focus();
    await user.keyboard("[Space]");
    await tick();
    await user.keyboard("[ArrowDown]");
    await tick();
    await user.keyboard("[Space]");
    await tick();
    expect(store.getState().slides.map((s) => s.mediaId)).toEqual(["a"]);
    expect(store.getState().slides[0]?.duration).toBe(5);
  });
});
