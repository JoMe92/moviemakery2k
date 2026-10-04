import { act, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";
import { NOTICE_DURATION } from "./StatusNotices";

const project = {
  schemaVersion: 4 as const,
  slides: [
    {
      kind: "image" as const,
      id: "s1",
      mediaId: "a",
      duration: 3,
      effectId: null,
      transitionIn: null,
    },
    {
      kind: "image" as const,
      id: "s2",
      mediaId: "b",
      duration: 3,
      effectId: null,
      transitionIn: null,
    },
  ],
  music: [],
};

afterEach(() => {
  vi.useRealTimers();
});

describe("compact layout (add-mobile-layout design.md D3)", () => {
  it.each(["portrait", "landscape"] as const)(
    "shows title bar, monitor, editing area and no desktop chrome (%s)",
    async (orientation) => {
      mockLayout("compact", { orientation });
      const { ready } = renderApp();
      await ready;
      const window = screen.getByTestId("compact-window");
      expect(window).toHaveAttribute("data-orientation", orientation);
      const titlebar = screen.getByRole("banner");
      expect(within(titlebar).getByRole("heading", { level: 1 })).toHaveTextContent(
        "moviemakerY2K – Unbenanntes Projekt",
      );
      expect(screen.getByRole("slider", { name: "Suchleiste" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Wiedergabe" })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Bearbeitung" })).toBeInTheDocument();
      expect(screen.queryByRole("menubar")).toBeNull();
      expect(screen.queryByRole("complementary", { name: "Filmaufgaben" })).toBeNull();
      expect(screen.queryByRole("contentinfo")).toBeNull();
      expect(screen.queryByRole("button", { name: "Zeitachse anzeigen" })).toBeNull();
    },
  );

  it("hints at '1. Aufnehmen' in an empty project", async () => {
    mockLayout("compact");
    const { ready } = renderApp();
    await ready;
    expect(
      screen.getByText(
        "Tippen Sie auf „1. Aufnehmen“, um Bilder zu importieren und hier hinzuzufügen.",
      ),
    ).toBeInTheDocument();
  });

  it("hints in English too", async () => {
    mockLayout("compact");
    const { ready, store } = renderApp();
    await ready;
    act(() => store.getState().setLocale("en"));
    expect(
      await screen.findByText("Tap “1. Capture” to import pictures and add them here."),
    ).toBeInTheDocument();
  });

  it("keeps playback and selection when the phone is rotated", async () => {
    const vp = mockLayout("compact");
    const { ready, store } = renderApp(mockApi({ getProject: vi.fn(async () => project) }));
    await ready;
    act(() => {
      store.getState().select({ kind: "slide", slideId: "s2" });
      store.getState().seek(1.5);
      store.getState().togglePlay();
    });
    const strip = screen.getByTestId("storyboard-strip");
    vp.resize(844, 390);
    expect(screen.getByTestId("compact-window")).toHaveAttribute("data-orientation", "landscape");
    expect(screen.getByTestId("storyboard-strip")).toBe(strip);
    expect(store.getState().playback.playing).toBe(true);
    expect(store.getState().playback.time).toBeGreaterThanOrEqual(1.5);
    expect(store.getState().selection).toEqual({ kind: "slide", slideId: "s2" });
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("shows a lasting warning symbol while saving failed", async () => {
    mockLayout("compact");
    const { ready, store } = renderApp();
    await ready;
    const titlebar = screen.getByRole("banner");
    expect(within(titlebar).queryByRole("img", { name: "Speichern fehlgeschlagen" })).toBeNull();
    act(() => store.setState({ saveState: "error" }));
    expect(
      within(titlebar).getByRole("img", { name: "Speichern fehlgeschlagen" }),
    ).toBeInTheDocument();
    act(() => store.setState({ saveState: "saving" }));
    act(() => store.setState({ saveState: "saved" }));
    expect(within(titlebar).queryByRole("img", { name: "Speichern fehlgeschlagen" })).toBeNull();
  });

  it("announces 'Gespeichert' briefly, only on the change into that state", async () => {
    mockLayout("compact");
    const { ready, store } = renderApp();
    await ready;
    vi.useFakeTimers();
    const status = () =>
      screen.getAllByRole("status").find((el) => el.getAttribute("aria-live") === "polite");
    act(() => vi.advanceTimersByTime(NOTICE_DURATION));
    act(() => store.setState({ saveState: "saving" }));
    act(() => store.setState({ saveState: "saved" }));
    expect(status()).toHaveTextContent("Gespeichert");
    act(() => vi.advanceTimersByTime(NOTICE_DURATION));
    expect(status()).toBeEmptyDOMElement();
    act(() => store.setState({ saveState: "saved" }));
    expect(status()).toBeEmptyDOMElement();
  });

  it("opens the file dialog from an import request without the collection pane", async () => {
    mockLayout("compact");
    const { ready, store } = renderApp();
    await ready;
    const input = screen.getByTestId("media-import-input") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    act(() => store.getState().requestImport("pictures"));
    expect(click).toHaveBeenCalledOnce();
    expect(input.accept).toBe("image/jpeg,image/png,image/webp");
  });
});
