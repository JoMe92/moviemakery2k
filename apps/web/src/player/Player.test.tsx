import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/apiClient";
import { mockApi } from "../store/testApi";
import { renderApp } from "../test/renderApp";

const SLIDES: Slide[] = [
  { id: "s1", mediaId: "a", duration: 5, transitionIn: null },
  { id: "s2", mediaId: "b", duration: 5, transitionIn: { transitionId: "fade", duration: 1.25 } },
  { id: "s3", mediaId: "a", duration: 5, transitionIn: { transitionId: "fade", duration: 1.25 } },
];

async function setup(slides: Slide[] = SLIDES) {
  const view = renderApp(
    mockApi({ getProject: vi.fn(async () => ({ schemaVersion: 1 as const, slides })) }),
  );
  await act(() => view.ready);
  const monitor = screen.getByRole("region", { name: "Vorschau" });
  return { ...view, monitor };
}

const time = (monitor: HTMLElement) => within(monitor).getByRole("status", { name: "Zeit" });

describe("Player", () => {
  it("deaktiviert die Steuerung bei leerem Bildstreifen", async () => {
    const { monitor } = await setup([]);
    for (const name of ["Wiedergabe", "Stopp", "Vorheriges Bild", "Nächstes Bild"]) {
      expect(within(monitor).getByRole("button", { name })).toBeDisabled();
    }
    expect(within(monitor).getByRole("slider", { name: "Suchleiste" })).toBeDisabled();
    expect(time(monitor)).toHaveTextContent("0:00:00,00 / 0:00:00,00");
  });

  it("Spec: zeigt die Gesamtdauer 0:00:12,50 und schaltet Wiedergabe/Pause um", async () => {
    const user = userEvent.setup();
    const { monitor, store } = await setup();
    expect(time(monitor)).toHaveTextContent("0:00:00,00 / 0:00:12,50");
    await user.click(within(monitor).getByRole("button", { name: "Wiedergabe" }));
    expect(store.getState().playback.playing).toBe(true);
    await user.click(within(monitor).getByRole("button", { name: "Pause" }));
    expect(store.getState().playback.playing).toBe(false);
  });

  it("Nächstes Bild, Stopp und Suchleiste bewegen die Zeitanzeige", async () => {
    const user = userEvent.setup();
    const { monitor } = await setup();
    await user.click(within(monitor).getByRole("button", { name: "Nächstes Bild" }));
    expect(time(monitor)).toHaveTextContent("0:00:05,00 / 0:00:12,50");
    const seek = within(monitor).getByRole("slider", { name: "Suchleiste" });
    fireEvent.change(seek, { target: { value: "4.38" } });
    expect(time(monitor)).toHaveTextContent("0:00:04,38 / 0:00:12,50");
    expect(seek).toHaveAttribute("aria-valuetext", "0:00:04,38");
    await user.click(within(monitor).getByRole("button", { name: "Stopp" }));
    expect(time(monitor)).toHaveTextContent("0:00:00,00 / 0:00:12,50");
  });

  it("Leertaste schaltet um – auch auf einer Schaltfläche nur einmal –, aber nicht im Eingabefeld", async () => {
    const user = userEvent.setup();
    const { monitor, store } = await setup();
    await user.keyboard(" ");
    expect(store.getState().playback.playing).toBe(true);
    act(() => store.getState().pause());

    within(monitor).getByRole("button", { name: "Nächstes Bild" }).focus();
    await user.keyboard(" ");
    expect(store.getState().playback.playing).toBe(true);
    expect(store.getState().playback.time).toBeLessThan(1); // kein „Klick“ auf Nächstes Bild
    act(() => store.getState().pause());

    // Eingabefeld im Dauer-Dialog: Leertaste bleibt beim Feld.
    await user.dblClick(screen.getByRole("button", { name: /^Bild 2:/ }));
    const input = screen.getByRole("textbox", { name: "Bilddauer (Sekunden):" });
    await user.type(input, " ");
    expect(store.getState().playback.playing).toBe(false);
  });

  it("Spec: Auswahl im Storyboard bei gestoppter Wiedergabe zeigt das Bild an seiner Startzeit", async () => {
    const user = userEvent.setup();
    const { monitor } = await setup();
    await user.click(screen.getByRole("button", { name: /^Bild 3:/ }));
    expect(time(monitor)).toHaveTextContent("0:00:08,75 / 0:00:12,50");
    expect(within(monitor).getByRole("slider", { name: "Suchleiste" })).toHaveValue("8.75");
  });

  it("hebt während der Wiedergabe das sichtbare Bild im Storyboard hervor", async () => {
    const { store } = await setup();
    const tile2 = screen.getByRole("button", { name: /^Bild 2:/ });
    expect(tile2).not.toHaveAttribute("aria-current");
    act(() => {
      store.getState().seek(6);
      store.getState().play();
    });
    expect(tile2).toHaveAttribute("aria-current", "true");
    act(() => store.getState().pause());
    expect(tile2).not.toHaveAttribute("aria-current");
  });

  it("Übergangsdemo startet beim Auswählen einer Katalogkachel und endet mit Wiedergabe", async () => {
    const user = userEvent.setup();
    const { store, monitor } = await setup();
    act(() => store.getState().setCollection("transitions"));
    await user.click(screen.getByRole("button", { name: "Kreis" }));
    expect(store.getState().demo?.playing).toBe(true);
    await user.click(within(monitor).getByRole("button", { name: "Wiedergabe" }));
    expect(store.getState().demo).toBeNull();
    expect(store.getState().playback.playing).toBe(true);
  });

  it("Spec: zeigt die Zeit auf Englisch als 0:00:12.50", async () => {
    localStorage.setItem("mmy.locale", "en");
    const view = renderApp(
      mockApi({ getProject: vi.fn(async () => ({ schemaVersion: 1 as const, slides: SLIDES })) }),
    );
    await act(() => view.ready);
    const monitor = screen.getByRole("region", { name: "Preview" });
    const display = within(monitor).getByRole("status", { name: "Time" });
    expect(display).toHaveTextContent("0:00:00.00 / 0:00:12.50");
    for (const name of ["Play", "Stop", "Previous picture", "Next picture"]) {
      expect(within(monitor).getByRole("button", { name })).toBeEnabled();
    }
    fireEvent.change(within(monitor).getByRole("slider", { name: "Seek bar" }), {
      target: { value: "4.38" },
    });
    expect(display).toHaveTextContent("0:00:04.38 / 0:00:12.50");
  });

  it("wechselt die Zeitanzeige ohne Neuladen die Sprache", async () => {
    const { monitor, store } = await setup();
    expect(time(monitor)).toHaveTextContent("0:00:00,00 / 0:00:12,50");
    act(() => store.getState().setLocale("en"));
    expect(within(monitor).getByRole("status", { name: "Time" })).toHaveTextContent(
      "0:00:00.00 / 0:00:12.50",
    );
  });
});
