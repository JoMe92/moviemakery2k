import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "../i18n/locale";
import type { Slide } from "../lib/apiClient";
import { TrimDialog, VolumeDialog } from "../musictrack/MusicClipDialogs";
import { createAppStore } from "../store/appStore";
import { SLIDE_DURATION, TRANSITION_DURATION } from "../store/projectOps";
import { mediaItem, mockApi } from "../store/testApi";
import { AppStoreContext } from "../store/useAppStore";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";
import { DurationDialog } from "./DurationDialog";

/** Renders inside a store so the UI language can be chosen. */
function renderIn(ui: React.ReactElement, locale: Locale = "de") {
  const store = createAppStore(mockApi(), { locale });
  return render(<AppStoreContext.Provider value={store}>{ui}</AppStoreContext.Provider>);
}

function durationDialog(value: number, onConfirm = vi.fn(() => true), locale: Locale = "de") {
  mockLayout("compact");
  renderIn(
    <DurationDialog
      open
      title="Eigenschaften"
      label={locale === "de" ? "Bilddauer (Sekunden):" : "Picture duration (seconds):"}
      value={value}
      range={SLIDE_DURATION}
      touchStep={0.5}
      onConfirm={onConfirm}
      onClose={() => {}}
    />,
    locale,
  );
  return onConfirm;
}

describe("touch inputs (add-mobile-layout design.md D10)", () => {
  it("raises a picture duration of 3 s twice by 0.5 s to 4 s", async () => {
    const user = userEvent.setup();
    const onConfirm = durationDialog(3);
    const plus = screen.getByRole("button", { name: "Bilddauer (Sekunden) erhöhen" });
    await user.click(plus);
    await user.click(plus);
    expect(screen.getByRole("textbox", { name: "Bilddauer (Sekunden):" })).toHaveValue("4");
    expect(screen.getByRole("slider", { name: "Bilddauer (Sekunden)" })).toHaveValue("4");
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledWith(4);
  });

  it("does so in English with the same step", async () => {
    const user = userEvent.setup();
    const onConfirm = durationDialog(
      3,
      vi.fn(() => true),
      "en",
    );
    await user.click(screen.getByRole("button", { name: "Increase Picture duration (seconds)" }));
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledWith(3.5);
  });

  it("stops at the duration limits", () => {
    durationDialog(SLIDE_DURATION.max);
    expect(screen.getByRole("button", { name: "Bilddauer (Sekunden) erhöhen" })).toBeDisabled();
  });

  it("disables '−' at the minimum", () => {
    durationDialog(SLIDE_DURATION.min);
    expect(screen.getByRole("button", { name: "Bilddauer (Sekunden) verringern" })).toBeDisabled();
  });

  it("keeps a numeric keyboard and the validity rules for typed values", async () => {
    const user = userEvent.setup();
    const onConfirm = durationDialog(
      3,
      vi.fn(() => false),
    );
    const field = screen.getByRole("textbox", { name: "Bilddauer (Sekunden):" });
    expect(field).toHaveAttribute("inputmode", "decimal");
    await user.clear(field);
    await user.type(field, "0,3");
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledWith(0.3);
    expect(screen.getByRole("alert")).toHaveTextContent(/0,5/);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("steps the transition duration by 0.25 s", async () => {
    mockLayout("compact");
    const user = userEvent.setup();
    const onConfirm = vi.fn(() => true);
    renderIn(
      <DurationDialog
        open
        title="Übergang"
        label="Übergangsdauer (Sekunden):"
        value={4.75}
        range={TRANSITION_DURATION}
        touchStep={0.25}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    const plus = screen.getByRole("button", { name: "Übergangsdauer (Sekunden) erhöhen" });
    await user.click(plus);
    expect(plus).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledWith(5);
  });

  it("steps the volume by 5 % within 0–200 %", async () => {
    mockLayout("compact");
    const user = userEvent.setup();
    const onConfirm = vi.fn(() => true);
    renderIn(
      <VolumeDialog open number={1} volume={1.95} onConfirm={onConfirm} onClose={() => {}} />,
    );
    const plus = screen.getByRole("button", { name: "Lautstärke erhöhen" });
    await user.click(plus);
    expect(plus).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Lautstärke (%)" })).toHaveAttribute(
      "inputmode",
      "decimal",
    );
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledWith(2);
  });

  it("steps the volume in English", async () => {
    mockLayout("compact");
    const user = userEvent.setup();
    const onConfirm = vi.fn(() => true);
    renderIn(
      <VolumeDialog open number={1} volume={0.05} onConfirm={onConfirm} onClose={() => {}} />,
      "en",
    );
    const minus = screen.getByRole("button", { name: "Decrease Volume" });
    await user.click(minus);
    expect(minus).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledWith(0);
  });

  it("trims by 0.1 s steps and keeps 0.5 s between start and end", async () => {
    mockLayout("compact");
    const user = userEvent.setup();
    const onConfirm = vi.fn(() => true);
    renderIn(
      <TrimDialog
        open
        number={1}
        clip={{ trimStart: 0, trimEnd: 1 }}
        fileDuration={10}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    const startPlus = screen.getByRole("button", { name: "Anfang erhöhen" });
    for (let i = 0; i < 5; i += 1) await user.click(startPlus);
    expect(screen.getByRole("textbox", { name: "Anfang" })).toHaveValue("0:00,50");
    expect(startPlus).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ende verringern" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledWith(0.5, 1);
  });

  it("trims with handles on the waveform and previews on release", async () => {
    mockLayout("compact");
    const user = userEvent.setup();
    const onConfirm = vi.fn(() => true);
    const onPreview = vi.fn();
    renderIn(
      <TrimDialog
        open
        number={1}
        clip={{ trimStart: 0, trimEnd: null }}
        fileDuration={10}
        peaksUrl="/api/media/x/peaks"
        onPreview={onPreview}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
      "en",
    );
    const wave = screen.getByTestId("trim-waveform");
    vi.spyOn(wave, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 72,
      right: 200,
      bottom: 72,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const start = within(wave).getByRole("slider", { name: "Start" });
    fireEvent.pointerDown(start, { pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(start, { pointerId: 1, clientX: 40 });
    fireEvent.pointerUp(start, { pointerId: 1, clientX: 40 });
    expect(onPreview).toHaveBeenCalledWith(2);
    expect(start).toHaveAttribute("aria-valuenow", "2");
    const end = within(wave).getByRole("slider", { name: "End" });
    end.focus();
    await user.keyboard("{ArrowLeft}");
    expect(end).toHaveAttribute("aria-valuenow", "9.9");
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledWith(2, 9.9);
  });

  it("shows the Save Movie wizard full screen with Back, Next and Cancel at the bottom", async () => {
    mockLayout("compact");
    const slides: Slide[] = [{ kind: "image", id: "s1", mediaId: "a", duration: 3, transitionIn: null }];
    const { store, ready } = renderApp(
      mockApi({
        listMedia: async () => [mediaItem("a")],
        getProject: vi.fn(async () => ({ schemaVersion: 3 as const, slides, music: [] })),
      }),
    );
    await act(() => ready);
    act(() => store.getState().openExportWizard());
    const wizard = screen.getByRole("dialog", { name: "Film speichern" });
    expect(wizard).toHaveClass("sheet");
    expect(wizard.querySelector(".panel")).toHaveClass("full");
    const footer = wizard.querySelector(".footer");
    expect(footer).not.toBeNull();
    const names = within(footer as HTMLElement)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual(["Zurück", "Weiter", "Abbrechen"]);
  });
});
