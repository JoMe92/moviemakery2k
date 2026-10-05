import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { MusicClip } from "../lib/apiClient";
import { slideDuration } from "../store/projectOps";
import { audioItem, mediaItem, mockApi, videoItem } from "../store/testApi";
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
  it("is disabled without elements", async () => {
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
    expect(store.getState().slides.map(slideDuration)).toEqual(Array(10).fill(6));
    await store.getState().flushSave();
    expect(api.saved.at(-1)?.slides.map(slideDuration)).toEqual(Array(10).fill(6));
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
        "Die Musik dauert 0:10:00,00. Mit den vorhandenen Elementen ist höchstens 0:05:00,00 erreichbar. Die Anzeigedauern bleiben unverändert.",
      ),
    ).toBeInTheDocument();
    expect(store.getState().slides).toBe(before);
    await user.click(within(dialog).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("dialog", { name: MENU })).not.toBeInTheDocument();
  });
});

describe("Clip → Film an Musik anpassen with video clips (fit-to-music-with-video-clips)", () => {
  /** Three pictures, a 7.5 s video clip and 60 s of music. */
  function withClip() {
    return renderApp(
      mockApi({
        listMedia: async () => [mediaItem("a"), videoItem("v", 7.5), audioItem("song", 60)],
      }),
    );
  }

  it("Spec: Mit einem Videoclip — the clip keeps its trim, the pictures carry the target", async () => {
    const user = userEvent.setup();
    const { store, ready } = withClip();
    await ready;
    for (let i = 0; i < 3; i++) store.getState().addSlide("a");
    store.getState().addSlide("v");
    store.setState({ music: [clip("song")] });
    await user.click(await openClipMenu(user));
    const { slides } = store.getState();
    // Three pictures at 17.5 s plus the untouched 7.5 s clip = 60 s.
    expect(slides.map(slideDuration)).toEqual([17.5, 17.5, 17.5, 7.5]);
    const video = slides[3];
    expect(video?.kind === "video" && [video.trimIn, video.trimOut]).toEqual([0, 7.5]);
    expect(screen.queryByRole("dialog", { name: MENU })).not.toBeInTheDocument();
  });

  it("stays available with a filmstrip of only video clips (D4)", async () => {
    const user = userEvent.setup();
    const { store, ready } = withClip();
    await ready;
    store.getState().addSlide("v");
    store.setState({ music: [clip("song")] });
    // Nothing to stretch is answered in the dialog, not by a disabled entry:
    // the user would not be able to explain the deactivation.
    const entry = await openClipMenu(user);
    expect(entry).not.toHaveAttribute("aria-disabled", "true");
  });

  it("Spec: Nichts zu dehnen — names the reachable duration and changes nothing", async () => {
    const user = userEvent.setup();
    const { store, ready } = withClip();
    await ready;
    store.getState().addSlide("v");
    store.setState({ music: [clip("song")] });
    const before = store.getState().slides;
    await user.click(await openClipMenu(user));
    const dialog = screen.getByRole("dialog", { name: MENU });
    expect(
      within(dialog).getByText(
        "Die Musik dauert 0:01:00,00. Mit den vorhandenen Elementen ist höchstens 0:00:07,50 erreichbar. Die Anzeigedauern bleiben unverändert.",
      ),
    ).toBeInTheDocument();
    expect(store.getState().slides).toBe(before);
  });

  it("names the reachable minimum in the other direction too (D3)", async () => {
    const user = userEvent.setup();
    const { store, ready } = renderApp(
      mockApi({
        listMedia: async () => [mediaItem("a"), videoItem("v", 30), audioItem("song", 10)],
      }),
    );
    await ready;
    store.getState().addSlide("v");
    store.getState().addSlide("a");
    store.setState({ music: [clip("song")] });
    const before = store.getState().slides;
    await user.click(await openClipMenu(user));
    const dialog = screen.getByRole("dialog", { name: MENU });
    // The 30 s clip alone is longer than the music, so even the shortest
    // picture (0.5 s) cannot get under 30.5 s.
    expect(
      within(dialog).getByText(
        "Die Musik dauert 0:00:10,00. Mit den vorhandenen Elementen ist mindestens 0:00:30,50 erreichbar. Die Anzeigedauern bleiben unverändert.",
      ),
    ).toBeInTheDocument();
    expect(store.getState().slides).toBe(before);
  });
});
