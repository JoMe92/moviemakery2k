import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { MusicClip } from "../lib/apiClient";
import { audioItem, mediaItem, mockApi } from "../store/testApi";
import { renderApp } from "../test/renderApp";

function clip(mediaId: string): MusicClip {
  return {
    id: `c-${mediaId}`,
    mediaId,
    trimStart: 0,
    trimEnd: null,
    volume: 1,
    fadeIn: false,
    fadeOut: false,
  };
}

const MENU = "Film an Musik anpassen";

async function openClipMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("menuitem", { name: "Clip" }));
  return screen.getByRole("menuitem", { name: MENU });
}

describe("Clip → Film an Musik anpassen", () => {
  it("is disabled without pictures", async () => {
    const user = userEvent.setup();
    const { store, ready } = renderApp(
      mockApi({ listMedia: async () => [mediaItem("a"), audioItem("song", 60)] }),
    );
    await ready;
    store.setState({ music: [clip("song")] });
    expect(await openClipMenu(user)).toHaveAttribute("aria-disabled", "true");
  });

  it("is disabled without music", async () => {
    const user = userEvent.setup();
    const { store, ready } = renderApp();
    await ready;
    store.getState().addSlide("a");
    expect(await openClipMenu(user)).toHaveAttribute("aria-disabled", "true");
  });

  it("Spec: Film anpassen — sets all durations at once and saves", async () => {
    const user = userEvent.setup();
    const api = mockApi({
      listMedia: async () => [mediaItem("a"), audioItem("song", 60)],
    });
    const { store, ready } = renderApp(api);
    await ready;
    for (let i = 0; i < 10; i++) store.getState().addSlide("a");
    store.setState({ music: [clip("song")] });
    const entry = await openClipMenu(user);
    expect(entry).not.toHaveAttribute("aria-disabled", "true");
    await user.click(entry);
    expect(store.getState().slides.map((s) => s.duration)).toEqual(Array(10).fill(6));
    await store.getState().flushSave();
    expect(api.saved.at(-1)?.slides.map((s) => s.duration)).toEqual(Array(10).fill(6));
  });

  it("Spec: Nicht erreichbar — dialog names 5 minutes and nothing changes", async () => {
    const user = userEvent.setup();
    const { store, ready } = renderApp(
      mockApi({ listMedia: async () => [mediaItem("a"), audioItem("song", 600)] }),
    );
    await ready;
    for (let i = 0; i < 5; i++) store.getState().addSlide("a");
    store.setState({ music: [clip("song")] });
    const before = store.getState().slides;
    await user.click(await openClipMenu(user));
    const dialog = screen.getByRole("dialog", { name: MENU });
    expect(
      within(dialog).getByText(
        "Die Musik dauert 0:10:00,00. Mit den vorhandenen Bildern ist höchstens 0:05:00,00 erreichbar. Die Bilddauern bleiben unverändert.",
      ),
    ).toBeInTheDocument();
    expect(store.getState().slides).toBe(before);
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog", { name: MENU })).not.toBeInTheDocument();
  });
});
