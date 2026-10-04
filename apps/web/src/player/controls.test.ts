import { describe, expect, it } from "vitest";
import { buildTimeline, frameAt } from "../timeline/timeline";
import {
  advance,
  clampTime,
  DEMO_HOLD,
  demoDuration,
  demoFrame,
  isTypingTarget,
  MAX_STEP,
  nextSlideTime,
  prevSlideTime,
  STOPPED,
  shouldToggleOnSpace,
  startPlayback,
  timelineOf,
  videoSeekTarget,
} from "./controls";

const slide = (id: string, duration = 5, t: number | null = null) => ({
  kind: "image" as const,
  id,
  mediaId: `m${id}`,
  duration,
  transitionIn: t === null ? null : { transitionId: "fade", duration: t },
});
// spec preview-player "Gesamtdauer": three images of 5 s, two transitions of 1.25 s → 12.5 s;
// image 2 fully visible from 5, image 3 from 8.75.
const tl = buildTimeline([slide("1"), slide("2", 5, 1.25), slide("3", 5, 1.25)]);

describe("control logic", () => {
  it("playback advances and stops at the last image at the end", () => {
    let p = startPlayback(STOPPED, tl.duration);
    expect(p).toEqual({ playing: true, time: 0 });
    for (let i = 0; i < 2000 && p.playing; i++) p = advance(p, 1 / 60, tl.duration);
    expect(p).toEqual({ playing: false, time: 12.5 });
    expect(frameAt(tl, p.time)).toEqual({ kind: "still", slideIndex: 2 });
    // Playing again at the end starts from the beginning.
    expect(startPlayback(p, tl.duration)).toEqual({ playing: true, time: 0 });
  });

  it("clamps large time jumps and ignores ticks while paused", () => {
    expect(advance({ playing: true, time: 1 }, 5, tl.duration).time).toBe(1 + MAX_STEP);
    expect(advance({ playing: true, time: 1 }, -1, tl.duration).time).toBe(1);
    const paused = { playing: false, time: 3 };
    expect(advance(paused, 0.1, tl.duration)).toBe(paused);
  });

  it("empty slideshow: playback does not start", () => {
    expect(startPlayback({ playing: false, time: 4 }, 0)).toEqual(STOPPED);
  });

  it("seeking is clamped to [0, duration]", () => {
    expect(clampTime(-3, 12.5)).toBe(0);
    expect(clampTime(99, 12.5)).toBe(12.5);
    expect(clampTime(Number.NaN, 12.5)).toBe(0);
    expect(clampTime(6.1, 12.5)).toBe(6.1);
  });

  it("Spec: 'Next image' during image 2 jumps to the end of the transition into image 3", () => {
    expect(nextSlideTime(tl, 6)).toBe(8.75);
    expect(nextSlideTime(tl, 4)).toBe(5); // in the middle of the transition into image 2
    expect(nextSlideTime(tl, 0)).toBe(5);
    expect(nextSlideTime(tl, 10)).toBe(12.5); // past the last image → end
  });

  it("'Previous image': start of the current image, shortly after it the previous one", () => {
    expect(prevSlideTime(tl, 7)).toBe(5);
    expect(prevSlideTime(tl, 5.2)).toBe(0);
    expect(prevSlideTime(tl, 12.5)).toBe(8.75);
    expect(prevSlideTime(tl, 0.3)).toBe(0);
  });

  it("computes the timeline only once per slides array", () => {
    const slides = [slide("1")];
    expect(timelineOf(slides)).toBe(timelineOf(slides));
    expect(timelineOf(slides).duration).toBe(5);
  });
});

describe("transition demo", () => {
  it("shows A, then the transition, then B", () => {
    expect(demoDuration(1.25)).toBe(2.25);
    expect(demoFrame(0.2, "circle", 1.25)).toEqual({ kind: "still", slideIndex: 0 });
    expect(demoFrame(DEMO_HOLD + 0.625, "circle", 1.25)).toEqual({
      kind: "transition",
      fromIndex: 0,
      toIndex: 1,
      transitionId: "circle",
      progress: 0.5,
    });
    expect(demoFrame(2.25, "circle", 1.25)).toEqual({ kind: "still", slideIndex: 1 });
  });
});

describe("space bar", () => {
  const ctx = { dialogOpen: false, dragging: false };
  const el = (html: string) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    document.body.append(wrap);
    return wrap.firstElementChild as HTMLElement;
  };

  it("toggles with focus on the page, a button or the seek bar", () => {
    expect(shouldToggleOnSpace({ key: " ", target: document.body }, ctx)).toBe(true);
    expect(shouldToggleOnSpace({ key: " ", target: el("<button>x</button>") }, ctx)).toBe(true);
    expect(shouldToggleOnSpace({ key: " ", target: el('<input type="range">') }, ctx)).toBe(true);
  });

  it("not in input fields, menus, dialogs, while dragging, with modifiers or on repeat", () => {
    for (const html of ['<input type="text">', "<textarea></textarea>", "<select></select>"]) {
      const target = el(html);
      expect(isTypingTarget(target)).toBe(true);
      expect(shouldToggleOnSpace({ key: " ", target }, ctx)).toBe(false);
    }
    const editable = el('<div contenteditable="true"><span>x</span></div>');
    expect(shouldToggleOnSpace({ key: " ", target: editable.firstElementChild }, ctx)).toBe(false);
    const menuItem = el('<div role="menu"><button role="menuitem">a</button></div>');
    expect(shouldToggleOnSpace({ key: " ", target: menuItem.firstElementChild }, ctx)).toBe(false);
    const body = document.body;
    expect(shouldToggleOnSpace({ key: " ", target: body }, { ...ctx, dialogOpen: true })).toBe(
      false,
    );
    expect(shouldToggleOnSpace({ key: " ", target: body }, { ...ctx, dragging: true })).toBe(false);
    expect(shouldToggleOnSpace({ key: " ", ctrlKey: true, target: body }, ctx)).toBe(false);
    expect(shouldToggleOnSpace({ key: " ", repeat: true, target: body }, ctx)).toBe(false);
    expect(shouldToggleOnSpace({ key: "Enter", target: body }, ctx)).toBe(false);
  });
});

describe("videoSeekTarget (design.md D5)", () => {
  it("leaves a decoded element alone while it already shows the position", () => {
    // A paused element reports its frame's presentation time, up to a frame
    // away from the request; seeking on that would restart decoding forever.
    expect(videoSeekTarget({ readyState: 4, currentTime: 0.0168 }, 0, 0, 2)).toBeNull();
    expect(videoSeekTarget({ readyState: 4, currentTime: 0 }, 0, 0, 2)).toBeNull();
  });

  it("seeks a decoded element once the position really moved", () => {
    expect(videoSeekTarget({ readyState: 4, currentTime: 0.0168 }, 1.5, 0, 2)).toBe(1.5);
  });

  it("never interrupts a pending seek", () => {
    expect(videoSeekTarget({ readyState: 4, currentTime: 0, seeking: true }, 1.5, 0, 2)).toBeNull();
    expect(
      videoSeekTarget({ readyState: 1, currentTime: 0.001, seeking: true }, 0, 0, 2),
    ).toBeNull();
  });

  it("Spec: nudges a clip that has no frame yet and already sits on the position", () => {
    // The CI case: trimIn 0 shown at playback time 0 - assigning 0 again
    // would be a no-op, so nothing would ever be decoded.
    expect(videoSeekTarget({ readyState: 0, currentTime: 0 }, 0, 0, 2)).toBe(0.001);
  });

  it("asks for the plain position while nothing is decoded but it really moved", () => {
    expect(videoSeekTarget({ readyState: 0, currentTime: 0 }, 1.5, 0, 2)).toBe(1.5);
  });

  it("nudges backwards at the very end of the trim", () => {
    expect(videoSeekTarget({ readyState: 0, currentTime: 2 }, 2, 0, 2)).toBe(1.999);
  });

  it("never leaves the trim of a clip shorter than the nudge", () => {
    expect(videoSeekTarget({ readyState: 0, currentTime: 1 }, 1, 1, 1)).toBe(1);
  });
});
