import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/apiClient";
import { mockApi } from "../store/testApi";
import { mockLayout } from "../test/mockLayout";
import { renderApp } from "../test/renderApp";

const slide = (id: string, mediaId: string, t: string | null = null, d = 1.25): Slide => ({
  kind: "image",
  id,
  mediaId,
  duration: 5,
  transitionIn: t ? { transitionId: t, duration: d } : null,
});

async function setup(slides: Slide[], locale: "de" | "en" = "de") {
  mockLayout("compact");
  const api = mockApi({
    getProject: vi.fn(async () => ({ schemaVersion: 3 as const, slides, music: [] })),
  });
  const user = userEvent.setup();
  const view = renderApp(api);
  await act(() => view.ready);
  if (locale === "en") act(() => view.store.getState().setLocale("en"));
  return { ...view, api, user };
}

const slot = (n: number) =>
  screen.getByRole("button", {
    name: new RegExp(`^(Übergang vor Bild|Transition before picture) ${n}:`),
  });

describe("transition sheet (add-mobile-layout design.md D9)", () => {
  it("sets 'Kreis' with its default duration, plays it once and saves", async () => {
    const { user, store, api } = await setup([slide("s1", "a"), slide("s2", "b")]);
    await user.click(slot(2));
    const sheet = within(screen.getByRole("dialog", { name: "Übergang" }));
    const options = sheet.getByRole("list", { name: "Übergänge zur Auswahl" });
    expect(
      within(options)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["–Kein Übergang", "Überblenden", "Kreis"]);
    expect(sheet.getByRole("button", { name: /Kein Übergang/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(sheet.getByRole("button", { name: "Kreis" }));
    expect(store.getState().slides[1]?.transitionIn).toEqual({
      transitionId: "circle",
      duration: 1.5,
    });
    expect(sheet.getByRole("button", { name: "Kreis" })).toHaveAttribute("aria-pressed", "true");
    // Played once in the monitor: from shortly before the transition, pausing after it.
    const { playback } = store.getState();
    expect(playback.playing).toBe(true);
    expect(playback.time).toBeCloseTo(5 - 1.5 - 0.5);
    expect(playback.until).toBeCloseTo(5 + 0.5);
    // The sheet stays open until "Fertig".
    expect(screen.getByRole("dialog", { name: "Übergang" })).toBeInTheDocument();
    await act(() => store.getState().flushSave());
    expect(api.saved.at(-1)?.slides[1]?.transitionIn?.transitionId).toBe("circle");
    await user.click(sheet.getByRole("button", { name: "Fertig" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pauses after the transition played once", async () => {
    const { user, store } = await setup([slide("s1", "a"), slide("s2", "b"), slide("s3", "a")]);
    await user.click(slot(2));
    await user.click(screen.getByRole("button", { name: "Überblenden" }));
    const until = store.getState().playback.until ?? 0;
    act(() => {
      for (let i = 0; i < 40; i += 1) store.getState().tick(0.1);
    });
    expect(store.getState().playback).toMatchObject({ playing: false, time: until });
  });

  it("removes the transition with 'Kein Übergang'", async () => {
    const { user, store } = await setup([slide("s1", "a"), slide("s2", "b", "fade")]);
    await user.click(slot(2));
    await user.click(screen.getByRole("button", { name: /Kein Übergang/ }));
    expect(store.getState().slides[1]?.transitionIn).toBeNull();
    expect(screen.getByRole("group", { name: "Übergangsdauer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Übergangsdauer erhöhen" })).toBeDisabled();
  });

  it("changes the duration in steps of 0.25 s and stops at 5 s", async () => {
    const { user, store } = await setup([slide("s1", "a"), slide("s2", "b", "fade", 4.75)]);
    await user.click(slot(2));
    const plus = screen.getByRole("button", { name: "Übergangsdauer erhöhen" });
    await user.click(plus);
    expect(store.getState().slides[1]?.transitionIn?.duration).toBe(5);
    expect(plus).toBeDisabled();
    await user.click(plus);
    expect(store.getState().slides[1]?.transitionIn?.duration).toBe(5);
    await user.click(screen.getByRole("button", { name: "Übergangsdauer verringern" }));
    expect(store.getState().slides[1]?.transitionIn?.duration).toBe(4.75);
  });

  it("disables '−' at 0.25 s", async () => {
    const { user } = await setup([slide("s1", "a"), slide("s2", "b", "fade", 0.25)]);
    await user.click(slot(2));
    expect(screen.getByRole("button", { name: "Übergangsdauer verringern" })).toBeDisabled();
  });

  it("names the transitions in English", async () => {
    const { user } = await setup([slide("s1", "a"), slide("s2", "b")], "en");
    await user.click(slot(2));
    const sheet = within(screen.getByRole("dialog", { name: "Transition" }));
    expect(sheet.getByRole("button", { name: "Circle" })).toBeInTheDocument();
    expect(sheet.getByRole("button", { name: /No transition/ })).toBeInTheDocument();
  });
});
