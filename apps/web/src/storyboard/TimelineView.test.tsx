import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MediaItem, Slide } from "../lib/apiClient";
import { SLIDE_DURATION } from "../store/projectOps";
import { mediaItem, mockApi, videoItem } from "../store/testApi";
import { renderApp } from "../test/renderApp";

const slide = (id: string, mediaId: string, duration = 5): Slide => ({
  kind: "image",
  id,
  mediaId,
  duration,
  effectId: null,
  transitionIn: null,
});

const videoSlide = (id: string, mediaId: string, trimIn = 0, trimOut = 10): Slide => ({
  kind: "video",
  id,
  mediaId,
  trimIn,
  trimOut,
  effectId: null,
  transitionIn: null,
});

async function setupWithMedia(slides: Slide[], media: MediaItem[]) {
  const api = mockApi({
    listMedia: vi.fn(async () => media),
    getProject: vi.fn(async () => ({ schemaVersion: 4 as const, slides, music: [] })),
  });
  const view = renderApp(api);
  await act(() => view.ready);
  return view;
}

const storyboard = () => screen.getByRole("region", { name: "Storyboard" });
const timelineToggle = () =>
  within(storyboard()).getByRole("button", { name: "Zeitachse anzeigen" });
const lane = () => within(storyboard()).getByTestId("timeline-lane");
const clip = (id: string) => within(lane()).getByTestId(`timeline-clip-${id}`);

const pointer = { pointerId: 1, isPrimary: true, button: 0 };

/** Drags `handle` horizontally by `deltaPx`, mirroring the document-level
 * pointermove/up the component listens for. */
function dragHandle(handle: HTMLElement, deltaPx: number) {
  fireEvent.pointerDown(handle, { ...pointer, clientX: 0 });
  fireEvent.pointerMove(document, { ...pointer, clientX: deltaPx });
  fireEvent.pointerUp(document, { ...pointer, clientX: deltaPx });
}

describe("Timeline view", () => {
  it("switches on via the storyboard pane's toggle button", async () => {
    const user = userEvent.setup();
    await setupWithMedia([slide("s1", "a")], [mediaItem("a")]);
    expect(within(storyboard()).queryByTestId("timeline-lane")).toBeNull();
    await user.click(timelineToggle());
    expect(within(storyboard()).getByTestId("timeline-lane")).toBeInTheDocument();
    expect(timelineToggle()).toHaveAttribute("aria-pressed", "true");
  });

  it("switching views keeps the selection and playhead position (design.md D7)", async () => {
    const user = userEvent.setup();
    const { store } = await setupWithMedia(
      [slide("s1", "a"), slide("s2", "b")],
      [mediaItem("a"), mediaItem("b")],
    );
    store.getState().select({ kind: "slide", slideId: "s2" });
    store.getState().seek(3);

    await user.click(timelineToggle());
    expect(clip("s2")).toHaveAttribute("aria-pressed", "true");
    expect(clip("s1")).toHaveAttribute("aria-pressed", "false");
    expect(store.getState().selection).toEqual({ kind: "slide", slideId: "s2" });
    expect(store.getState().playback.time).toBe(3);

    await user.click(timelineToggle());
    expect(store.getState().selection).toEqual({ kind: "slide", slideId: "s2" });
    expect(store.getState().playback.time).toBe(3);
  });

  it("selecting a clip in the timeline view updates the shared selection", async () => {
    const user = userEvent.setup();
    const { store } = await setupWithMedia([slide("s1", "a")], [mediaItem("a")]);
    await user.click(timelineToggle());
    await user.click(clip("s1"));
    expect(store.getState().selection).toEqual({ kind: "slide", slideId: "s1" });
  });

  it("the zoom slider scales a clip's width", async () => {
    const user = userEvent.setup();
    await setupWithMedia([slide("s1", "a", 5)], [mediaItem("a")]);
    await user.click(timelineToggle());
    const before = clip("s1").style.width;
    const zoom = within(storyboard()).getByRole("slider", { name: "Zoom" });
    fireEvent.change(zoom, { target: { value: "2" } });
    const after = clip("s1").style.width;
    expect(parseFloat(after)).toBeCloseTo(parseFloat(before) * 2, 3);
  });

  it("dragging a picture's end handle extends its display duration", async () => {
    const user = userEvent.setup();
    const { store } = await setupWithMedia([slide("s1", "a", 5)], [mediaItem("a")]);
    await user.click(timelineToggle());
    dragHandle(within(clip("s1")).getByTestId("trim-handle-end"), 40); // 40px / 20px-s = 2s
    const result = store.getState().slides[0];
    expect(result?.kind === "image" && result.duration).toBe(7);
  });

  it("dragging a picture's start handle shrinks its display duration", async () => {
    const user = userEvent.setup();
    const { store } = await setupWithMedia([slide("s1", "a", 5)], [mediaItem("a")]);
    await user.click(timelineToggle());
    dragHandle(within(clip("s1")).getByTestId("trim-handle-start"), 40);
    const result = store.getState().slides[0];
    expect(result?.kind === "image" && result.duration).toBe(3);
  });

  it("Spec: a picture's duration never drops below the minimum while dragging", async () => {
    const user = userEvent.setup();
    const { store } = await setupWithMedia([slide("s1", "a", 1)], [mediaItem("a")]);
    await user.click(timelineToggle());
    dragHandle(within(clip("s1")).getByTestId("trim-handle-start"), 2000);
    const result = store.getState().slides[0];
    expect(result?.kind === "image" && result.duration).toBe(SLIDE_DURATION.min);
  });

  it("dragging a video clip's end handle extends trimOut", async () => {
    const user = userEvent.setup();
    const { store } = await setupWithMedia([videoSlide("s1", "v", 2, 8)], [videoItem("v", 10)]);
    await user.click(timelineToggle());
    dragHandle(within(clip("s1")).getByTestId("trim-handle-end"), 40); // +2s
    const result = store.getState().slides[0];
    expect(result?.kind === "video" && result.trimOut).toBe(10);
  });

  it("dragging a video clip's start handle increases trimIn", async () => {
    const user = userEvent.setup();
    const { store } = await setupWithMedia([videoSlide("s1", "v", 2, 8)], [videoItem("v", 10)]);
    await user.click(timelineToggle());
    dragHandle(within(clip("s1")).getByTestId("trim-handle-start"), 20); // +1s
    const result = store.getState().slides[0];
    expect(result?.kind === "video" && result.trimIn).toBe(3);
  });

  it("Spec: a video's trimOut never exceeds the file's duration while dragging", async () => {
    const user = userEvent.setup();
    const { store } = await setupWithMedia([videoSlide("s1", "v", 2, 8)], [videoItem("v", 10)]);
    await user.click(timelineToggle());
    dragHandle(within(clip("s1")).getByTestId("trim-handle-end"), 2000);
    const result = store.getState().slides[0];
    expect(result?.kind === "video" && result.trimOut).toBe(10);
  });

  it("Spec: a video's trimIn never reaches or passes trimOut while dragging", async () => {
    const user = userEvent.setup();
    const { store } = await setupWithMedia([videoSlide("s1", "v", 2, 8)], [videoItem("v", 10)]);
    await user.click(timelineToggle());
    dragHandle(within(clip("s1")).getByTestId("trim-handle-start"), 2000);
    const result = store.getState().slides[0];
    if (result?.kind !== "video") throw new Error("expected a video slide");
    expect(result.trimIn).toBeLessThan(result.trimOut);
  });

  it("shows a wedge for the transition between two clips", async () => {
    const user = userEvent.setup();
    const slides: Slide[] = [
      slide("s1", "a"),
      { ...slide("s2", "b"), transitionIn: { transitionId: "fade", duration: 1 } },
    ];
    await setupWithMedia(slides, [mediaItem("a"), mediaItem("b")]);
    await user.click(timelineToggle());
    // The wedge is an overlay in the track, next to the clip list.
    const wedge = within(storyboard()).getByTestId("timeline-transition-s2");
    expect(wedge).toHaveAttribute("role", "img");
    expect(wedge).toHaveAccessibleName("Übergang: Überblenden");
  });
});
