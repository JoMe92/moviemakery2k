import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MediaItem, Slide } from "../lib/apiClient";
import type { ImageSource } from "../render/Renderer";
import { videoItem } from "../store/testApi";
import { buildTimeline, type Timeline } from "../timeline/timeline";
import { toTimelineSlides } from "./controls";
import { useSlideImages } from "./Player";

/**
 * Component tests of the player's video texture (add-timeline-editing design.md
 * D5, spec preview-player "Videoclips in der Wiedergabe"): a hidden, muted
 * `<video>` element (rendered, not detached - some engines need that to
 * decode) is scrubbed via `currentTime`, never played.
 *
 * image "s1" (0..5s) -- 1s fade --> video "s2" (trimIn 2, trimOut 6, so 4s
 * long): the transition overlaps [4, 5), the video's own still portion is
 * [5, 8).
 */
const SLIDES: Slide[] = [
  { kind: "image", id: "s1", mediaId: "a", duration: 5, transitionIn: null },
  {
    kind: "video",
    id: "s2",
    mediaId: "clip",
    trimIn: 2,
    trimOut: 6,
    transitionIn: { transitionId: "fade", duration: 1 },
  },
];
const MEDIA: MediaItem[] = [videoItem("clip", 8)];

type Images = (index: number) => ImageSource | undefined;

/** Mounts the hook and renders its (hidden) video elements; `onReady` always
 * gets the latest `images` function, including after a rerender. */
function Harness({
  slides,
  timeline,
  time,
  onReady,
}: {
  slides: Slide[];
  timeline: Timeline;
  time: number;
  onReady: (images: Images) => void;
}) {
  const { images, videoElements } = useSlideImages(slides, MEDIA, timeline, time);
  onReady(images);
  return <>{videoElements}</>;
}

function setup(time: number) {
  const timeline = buildTimeline(toTimelineSlides(SLIDES));
  let images: Images = () => undefined;
  const view = render(
    <Harness slides={SLIDES} timeline={timeline} time={time} onReady={(fn) => (images = fn)} />,
  );
  const rerender = (nextTime: number) =>
    view.rerender(
      <Harness
        slides={SLIDES}
        timeline={timeline}
        time={nextTime}
        onReady={(fn) => (images = fn)}
      />,
    );
  return { images: () => images, rerender };
}

describe("useSlideImages: video texture", () => {
  it("Spec: playback inside the video's own still portion shows trimIn + elapsed", () => {
    const { images } = setup(6);
    const video = images()(1) as HTMLVideoElement;
    expect(video).toBeInstanceOf(HTMLVideoElement);
    // 6s overall - 4s segment start + 2s trimIn = 4s into the original.
    expect(video.currentTime).toBe(4);
  });

  it("Spec: a transition at the video boundary scrubs mid-transition", () => {
    const { images } = setup(4.5);
    const video = images()(1) as HTMLVideoElement;
    // 4.5s overall - 4s segment start + 2s trimIn = 2.5s into the original.
    expect(video.currentTime).toBe(2.5);
  });

  it("Spec: seeking before or after the segment clamps to trimIn/trimOut", () => {
    const { images, rerender } = setup(0);
    expect((images()(1) as HTMLVideoElement).currentTime).toBe(2); // clamped to trimIn
    act(() => rerender(100));
    expect((images()(1) as HTMLVideoElement).currentTime).toBe(6); // clamped to trimOut
  });

  it("is muted, never played, and the same element is reused across draws", () => {
    const { images, rerender } = setup(5);
    const first = images()(1) as HTMLVideoElement;
    expect(first.muted).toBe(true);
    expect(first.src).toContain("/api/media/clip/video");
    expect(first.paused).toBe(true);

    act(() => rerender(6));
    const second = images()(1) as HTMLVideoElement;
    expect(second).toBe(first); // same element, only currentTime changed
    expect(second.paused).toBe(true);
  });

  it("releases the video element when its slide is removed", () => {
    const timeline = buildTimeline(toTimelineSlides(SLIDES));
    let images: Images = () => undefined;
    const view = render(
      <Harness
        slides={SLIDES}
        timeline={timeline}
        time={6}
        onReady={(fn) => (images = fn)}
      />,
    );
    const video = images(1) as HTMLVideoElement;
    expect(video.src).not.toBe("");

    act(() => {
      view.rerender(
        <Harness
          slides={[SLIDES[0] as Slide]}
          timeline={timeline}
          time={6}
          onReady={(fn) => (images = fn)}
        />,
      );
    });
    expect(video.isConnected).toBe(false);
  });
});
