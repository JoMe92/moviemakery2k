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
const slot = (n: number) =>
  within(strip()).getByRole("button", { name: new RegExp(`^Übergang vor Bild ${n}:`) });
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
    const slotMatch = /^Übergang vor Bild (\d+):/.exec(label);
    if (slotMatch) return rect(20 + (Number(slotMatch[1]) - 1) * 160 - 54, 540, 52, 60);
    if (this.getAttribute("data-testid") === "storyboard-strip") return rect(0, 500, 1200, 150);
    // DragOverlay: liegt anfangs über der gezogenen (fokussierten) Kachel.
    const isOverlay =
      this.getAttribute("data-testid") === "drag-overlay" ||
      this.querySelector(":scope > [data-testid='drag-overlay']") !== null;
    const focused = document.activeElement;
    if (isOverlay && focused && focused !== this && focused !== document.body) {
      return focused.getBoundingClientRect();
    }
    const li = this.closest("ul[aria-label='Bilder'] > li, ul[aria-label='Übergänge'] > li");
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
    expect(within(strip()).queryByRole("button", { name: /^Übergang vor Bild 1/ })).toBeNull();
    expect(slot(2)).toHaveAccessibleName("Übergang vor Bild 2: Kreis, 1,25 s");
    expect(slot(2)).toHaveTextContent("Kreis1,25 s");
    expect(slot(3)).toHaveAccessibleName("Übergang vor Bild 3: keiner (harter Schnitt)");
    expect(slot(3)).toHaveTextContent("–");
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

  it("selects a tile with the first click right after a pointer drop (mmy-fa5)", async () => {
    const { store } = await setup([slide("s1", "a"), slide("s2", "b"), slide("s3", "a")]);
    const third = within(strip()).getByRole("button", { name: /^Bild 3:/ });
    const pointer = { pointerId: 1, isPrimary: true, button: 0 };
    // Drag tile 3 in front of tile 1 (past the 5 px activation distance).
    fireEvent.pointerDown(third, { ...pointer, clientX: 392, clientY: 570 });
    fireEvent.pointerMove(document, { ...pointer, clientX: 380, clientY: 570 });
    await tick();
    fireEvent.pointerMove(document, { ...pointer, clientX: 40, clientY: 570 });
    await tick();
    fireEvent.pointerUp(document, { ...pointer, clientX: 40, clientY: 570 });
    expect(store.getState().slides.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);

    // The click that ends the drag gesture is still swallowed ...
    fireEvent.click(third);
    expect(store.getState().selection).toBeNull();

    // ... but a new click immediately after the drop selects (no 50 ms dead time).
    const target = within(strip()).getByRole("button", { name: /^Bild 2:/ });
    fireEvent.pointerDown(target, { ...pointer, clientX: 200, clientY: 570 });
    fireEvent.pointerUp(target, { ...pointer, clientX: 200, clientY: 570 });
    fireEvent.click(target);
    expect(target).toHaveAttribute("aria-pressed", "true");
    expect(store.getState().selection).toEqual({ kind: "slide", slideId: "s1" });
  });

  it("entfernt über das Kontextmenü", async () => {
    const user = userEvent.setup();
    const { store } = await setup([slide("s1", "a"), slide("s2", "b")]);
    const second = within(strip()).getByRole("button", { name: /^Bild 2:/ });
    fireEvent.contextMenu(second, { clientX: 50, clientY: 50 });
    const menu = screen.getByRole("menu", { name: "Bild 2 des Storyboards" });
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
    await user.keyboard("[Enter]");
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
    await user.keyboard("[Enter]");
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
    await user.keyboard("[Enter]");
    await tick();
    await user.keyboard("[ArrowDown]");
    await tick();
    await user.keyboard("[Space]");
    await tick();
    expect(store.getState().slides.map((s) => s.mediaId)).toEqual(["a"]);
    expect(store.getState().slides[0]?.duration).toBe(5);
  });

  it("setzt einen Übergang per Tastatur auf einen Platz und ersetzt einen vorhandenen", async () => {
    const user = userEvent.setup();
    const { store } = await setup([
      slide("s1", "a"),
      slide("s2", "b"),
      slide("s3", "a", 5, "fade"),
    ]);
    act(() => store.getState().setCollection("transitions"));
    const collection = screen.getByRole("region", { name: "Sammlung: Videoübergänge" });
    within(collection).getByRole("button", { name: "Kreis" }).focus();
    await user.keyboard("[Enter]");
    await tick();
    await user.keyboard("[ArrowDown]"); // erster Platz: vor Bild 2
    await tick();
    expect(slot(2)).toHaveAttribute("data-drop", "true");
    await user.keyboard("[ArrowRight]"); // Platz vor Bild 3 (hat „Überblenden“)
    await tick();
    await user.keyboard("[Space]");
    await tick();
    const slides = store.getState().slides;
    expect(slides[1]?.transitionIn).toBeNull();
    // Ersetzt, mit der Standarddauer aus dem Katalog.
    expect(slides[2]?.transitionIn).toEqual({ transitionId: "circle", duration: 1.5 });
    expect(slot(3)).toHaveAccessibleName("Übergang vor Bild 3: Kreis, 1,50 s");
  });

  it("Übergangsdialog: ungültige Dauer wird abgelehnt, gültige übernommen", async () => {
    const user = userEvent.setup();
    const { store } = await setup([slide("s1", "a"), slide("s2", "b", 5, "circle")]);
    await user.dblClick(slot(2));
    const dialog = screen.getByRole("dialog", { name: "Übergang vor Bild 2" });
    expect(dialog).toHaveTextContent("Übergang: Kreis");
    const input = within(dialog).getByRole("textbox", { name: "Übergangsdauer (Sekunden):" });
    expect(input).toHaveValue("1,25");

    await user.clear(input);
    await user.type(input, "9");
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Erlaubt sind 0,25 bis 5 Sekunden in Schritten von 0,25.",
    );
    expect(store.getState().slides[1]?.transitionIn?.duration).toBe(1.25);

    await user.clear(input);
    await user.type(input, "1,5{Enter}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(store.getState().slides[1]?.transitionIn?.duration).toBe(1.5);
    expect(slot(2)).toHaveTextContent("1,50 s");
  });

  it("entfernt einen Übergang über den Dialog und über das Kontextmenü", async () => {
    const user = userEvent.setup();
    const { store } = await setup([
      slide("s1", "a"),
      slide("s2", "b", 5, "fade"),
      slide("s3", "a", 5, "circle"),
    ]);
    slot(2).focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Übergang entfernen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(store.getState().slides[1]?.transitionIn).toBeNull();

    fireEvent.contextMenu(slot(3), { clientX: 10, clientY: 10 });
    const menu = screen.getByRole("menu", { name: "Übergang vor Bild 3" });
    await user.click(within(menu).getByRole("menuitem", { name: "Übergang entfernen" }));
    expect(store.getState().slides[2]?.transitionIn).toBeNull();

    // Leerer Platz: nichts zu bearbeiten.
    fireEvent.contextMenu(slot(3), { clientX: 10, clientY: 10 });
    for (const item of within(screen.getByRole("menu")).getAllByRole("menuitem")) {
      expect(item).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("Bilddauer: Doppelklick bzw. Kontextmenü öffnet den Dialog; 0,1 s wird abgelehnt", async () => {
    const user = userEvent.setup();
    const { store } = await setup([slide("s1", "a"), slide("s2", "b")]);
    await user.dblClick(within(strip()).getByRole("button", { name: /^Bild 2:/ }));
    let dialog = screen.getByRole("dialog", { name: "Eigenschaften von Bild 2" });
    const input = within(dialog).getByRole("textbox", { name: "Bilddauer (Sekunden):" });
    expect(input).toHaveValue("5");
    await user.clear(input);
    await user.type(input, "0,1");
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Erlaubt sind 0,5 bis 60 Sekunden in Schritten von 0,25.",
    );
    expect(store.getState().slides[1]?.duration).toBe(5);
    await user.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(store.getState().slides[1]?.duration).toBe(5);

    fireEvent.contextMenu(within(strip()).getByRole("button", { name: /^Bild 2:/ }), {
      clientX: 10,
      clientY: 10,
    });
    await user.click(screen.getByRole("menuitem", { name: "Eigenschaften…" }));
    dialog = screen.getByRole("dialog", { name: "Eigenschaften von Bild 2" });
    const again = within(dialog).getByRole("textbox", { name: "Bilddauer (Sekunden):" });
    await user.clear(again);
    await user.type(again, "2,5");
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(store.getState().slides[1]?.duration).toBe(2.5);
    expect(tileLabels()[1]).toBe("Bild 2: b.jpg, 2,50 s");
  });
});
