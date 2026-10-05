import { describe, expect, it } from "vitest";
import {
  canFitToMusic,
  type FitSlide,
  fitToMusic,
  isStretchable,
  movieDurationWith,
} from "./fitToMusic";
import { buildTimeline, formatTime } from "./timeline";

function slides(count: number, transition = 0, duration = 5): FitSlide[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    mediaId: `m${i}`,
    duration,
    transitionIn: i > 0 && transition > 0 ? { transitionId: "fade", duration: transition } : null,
  }));
}

function applied(input: readonly FitSlide[], durations: readonly number[]): FitSlide[] {
  return input.map((s, i) => ({ ...s, duration: durations[i] ?? s.duration }));
}

function onGrid(value: number): boolean {
  return Math.abs(value / 0.25 - Math.round(value / 0.25)) < 1e-9;
}

describe("fitToMusic (add-music-track D8)", () => {
  it("Spec: Film anpassen — 60 s music, ten pictures without transitions → 6 s each", () => {
    const input = slides(10);
    const result = fitToMusic(input, 60);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.durations).toEqual(Array(10).fill(6));
    const timeline = buildTimeline(applied(input, result.durations));
    expect(formatTime(timeline.duration)).toBe("0:01:00,00");
  });

  it("Spec: Mit Übergängen — 20 s music, four pictures, three 1 s transitions → 5.75 s each", () => {
    const input = slides(4, 1);
    const result = fitToMusic(input, 20);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.durations).toEqual([5.75, 5.75, 5.75, 5.75]);
    const fitted = applied(input, result.durations);
    expect(formatTime(buildTimeline(fitted).duration)).toBe("0:00:20,00");
    // Transitions stay unchanged.
    expect(fitted.map((s) => s.transitionIn)).toEqual(input.map((s) => s.transitionIn));
  });

  it("Spec: Nicht erreichbar — 10 min music, five pictures → at most 5 min, no durations", () => {
    const result = fitToMusic(slides(5), 600);
    expect(result).toEqual({ kind: "tooLong", reachable: 300 });
  });

  it("reports the reachable maximum including the transitions", () => {
    // 3 × 60 s − 2 × 2 s transitions
    expect(fitToMusic(slides(3, 2), 1000)).toEqual({ kind: "tooLong", reachable: 176 });
  });

  it("reports the reachable minimum when the music is too short", () => {
    // 10 pictures × 0.5 s = 5 s; transitions shrink to 0.25 s (half of 0.5 s).
    expect(fitToMusic(slides(10), 3)).toEqual({ kind: "tooShort", reachable: 5 });
    expect(fitToMusic(slides(10, 1), 2)).toEqual({ kind: "tooShort", reachable: 2.75 });
  });

  it("rounds to 0.25 s and puts the remainder on the last picture", () => {
    // 10 s / 3 = 3.33 s → 3.25 s; last picture 10 − 6.5 = 3.5 s
    const input = slides(3);
    const result = fitToMusic(input, 10);
    expect(result).toEqual({ kind: "ok", durations: [3.25, 3.25, 3.5], total: 10 });
  });

  it("gets as close as possible when the music length is off the 0.25 s grid", () => {
    const input = slides(4);
    const result = fitToMusic(input, 61.3);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.durations.slice(0, 3)).toEqual([15.25, 15.25, 15.25]);
    expect(result.durations[3]).toBe(15.5);
    expect(result.total).toBeCloseTo(61.25, 9);
    for (const d of result.durations) {
      expect(onGrid(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0.5);
      expect(d).toBeLessThanOrEqual(60);
    }
  });

  it("matches the timeline within 0.125 s for many layouts", () => {
    for (const count of [1, 2, 5, 17, 40]) {
      for (const transition of [0, 0.25, 1.25, 5]) {
        const input = slides(count, transition);
        for (const target of [7, 33.3, 120, 599.9]) {
          const result = fitToMusic(input, target);
          if (result.kind !== "ok") continue;
          const total = buildTimeline(applied(input, result.durations)).duration;
          expect(total).toBeCloseTo(result.total, 9);
          expect(movieDurationWith(input, result.durations)).toBeCloseTo(total, 9);
          expect(Math.abs(total - target)).toBeLessThanOrEqual(0.125 + 1e-9);
          for (const d of result.durations) expect(onGrid(d)).toBe(true);
        }
      }
    }
  });

  it("is unavailable without pictures or without music", () => {
    expect(fitToMusic([], 60)).toEqual({ kind: "unavailable" });
    expect(fitToMusic(slides(3), 0)).toEqual({ kind: "unavailable" });
    expect(canFitToMusic(0, 60)).toBe(false);
    expect(canFitToMusic(3, 0)).toBe(false);
    expect(canFitToMusic(3, 60)).toBe(true);
  });
});

describe("fitToMusic with fixed video clips (fit-to-music-with-video-clips D1–D3)", () => {
  /** A picture or title element: the fit owns its display duration (D1). */
  function picture(id: string, duration = 5, transition = 0): FitSlide {
    return {
      id,
      mediaId: `m-${id}`,
      duration,
      transitionIn: transition > 0 ? { transitionId: "fade", duration: transition } : null,
    };
  }

  /** A title element — no medium of its own, but a display duration (D1). */
  function title(id: string, duration = 5, transition = 0): FitSlide {
    return { ...picture(id, duration, transition), mediaId: null };
  }

  /** A video clip: `duration` is its trim window and MUST stay unchanged (D1). */
  function clip(id: string, duration: number, transition = 0): FitSlide {
    return { ...picture(id, duration, transition), stretchable: false };
  }

  it("Spec: Mit einem Videoclip — 60 s music, three pictures and a 7.5 s clip → 17.5 s each", () => {
    const input = [picture("a"), picture("b"), picture("c"), clip("v", 7.5)];
    const result = fitToMusic(input, 60);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    // The clip keeps its trim window, the pictures carry the whole target.
    expect(result.durations).toEqual([17.5, 17.5, 17.5, 7.5]);
    expect(formatTime(buildTimeline(applied(input, result.durations)).duration)).toBe("0:01:00,00");
    expect(result.total).toBeCloseTo(60, 9);
  });

  it("hits the music exactly wherever the fixed clip sits in the storyboard", () => {
    for (const at of [0, 1, 2, 3]) {
      const input = [picture("a"), picture("b"), picture("c")];
      input.splice(at, 0, clip("v", 7.5));
      const result = fitToMusic(input, 60);
      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") return;
      // The clip's own length comes back untouched at its own position.
      expect(result.durations[at]).toBe(7.5);
      expect(buildTimeline(applied(input, result.durations)).duration).toBeCloseTo(60, 9);
    }
  });

  it("Spec: Mit einem Titel-Element — 30 s music, a title and two pictures → 10 s each", () => {
    const input = [title("t"), picture("a"), picture("b")];
    const result = fitToMusic(input, 30);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    // A title element has a display duration, so it is stretched along (D1).
    expect(result.durations).toEqual([10, 10, 10]);
    expect(formatTime(buildTimeline(applied(input, result.durations)).duration)).toBe("0:00:30,00");
  });

  it("measures a transition on the border to a fixed clip over both neighbours (D2)", () => {
    // A 1 s clip between two pictures, 1 s transitions: the clip's own half
    // length caps each overlap at 0.5 s, so total = 2d + 1 − 0.5 − 0.5 = 2d.
    // "Music length minus clip length" would target 19 s for the pictures and
    // land on 19 s instead of 20 s — the overlap depends on both neighbours.
    const input = [picture("a"), clip("v", 1, 1), picture("b", 5, 1)];
    const result = fitToMusic(input, 20);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.durations).toEqual([10, 1, 10]);
    const fitted = applied(input, result.durations);
    expect(formatTime(buildTimeline(fitted).duration)).toBe("0:00:20,00");
    // Transitions stay unchanged.
    expect(fitted.map((s) => s.transitionIn)).toEqual(input.map((s) => s.transitionIn));
  });

  it("Spec: Nichts zu dehnen — two clips of 20 s and 60 s music → at most 20 s", () => {
    const input = [clip("v1", 12.5), clip("v2", 7.5)];
    expect(fitToMusic(input, 60)).toEqual({ kind: "tooLong", reachable: 20 });
    // The other direction out of the same branch: nothing can get shorter either.
    expect(fitToMusic(input, 5)).toEqual({ kind: "tooShort", reachable: 20 });
  });

  it("leaves a storyboard of only clips alone when it already matches the music", () => {
    const input = [clip("v1", 12.5), clip("v2", 7.5)];
    const result = fitToMusic(input, 20);
    expect(result).toEqual({ kind: "ok", durations: [12.5, 7.5], total: 20 });
  });

  it("counts the fixed clips into the reachable minimum and maximum (D3)", () => {
    // 30 s of fixed clip plus one picture: at least 30.5 s, at most 90 s.
    const input = [clip("v", 30), picture("a")];
    expect(fitToMusic(input, 20)).toEqual({ kind: "tooShort", reachable: 30.5 });
    expect(fitToMusic(input, 200)).toEqual({ kind: "tooLong", reachable: 90 });
  });

  it("puts the remainder on the last stretchable element, not the last clip", () => {
    // 10 s target, a 1 s clip last: 9 s over three pictures = 3 s each, exact.
    // 10.5 s target: 3.1666 → 3.25 s, and the last *picture* carries the rest.
    const input = [picture("a"), picture("b"), picture("c"), clip("v", 1)];
    const result = fitToMusic(input, 10.5);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.durations[3]).toBe(1);
    expect(result.durations.slice(0, 2)).toEqual([3.25, 3.25]);
    expect(result.durations[2]).toBe(3);
    expect(result.total).toBeCloseTo(10.5, 9);
  });

  it("keeps every fitted duration on the grid and within the limits", () => {
    for (const clipLength of [0.4, 7.5, 30]) {
      for (const transition of [0, 1]) {
        const input = [
          picture("a", 5, transition),
          clip("v", clipLength, transition),
          title("t", 5, transition),
          picture("b", 5, transition),
        ];
        for (const target of [12, 33.3, 150]) {
          const result = fitToMusic(input, target);
          if (result.kind !== "ok") continue;
          expect(result.durations[1]).toBe(clipLength);
          expect(Math.abs(result.total - target)).toBeLessThanOrEqual(0.125 + 1e-9);
          for (const [i, d] of result.durations.entries()) {
            if (!isStretchable(input[i] as FitSlide)) continue;
            expect(onGrid(d)).toBe(true);
            expect(d).toBeGreaterThanOrEqual(0.5);
            expect(d).toBeLessThanOrEqual(60);
          }
        }
      }
    }
  });

  it("is character for character the old result without a video clip (D2)", () => {
    // Marking everything stretchable explicitly must not change a thing, so a
    // storyboard without a clip keeps the results the existing cases pin down.
    for (const count of [1, 3, 10]) {
      for (const transition of [0, 1]) {
        for (const target of [10, 20, 61.3, 600]) {
          const bare = slides(count, transition);
          const flagged = bare.map((s) => ({ ...s, stretchable: true }));
          expect(fitToMusic(flagged, target)).toEqual(fitToMusic(bare, target));
        }
      }
    }
  });

  it("treats an element without the flag as stretchable", () => {
    expect(isStretchable({ id: "a", mediaId: "m", duration: 5, transitionIn: null })).toBe(true);
    expect(
      isStretchable({ id: "a", mediaId: "m", duration: 5, transitionIn: null, stretchable: true }),
    ).toBe(true);
    expect(
      isStretchable({ id: "a", mediaId: "m", duration: 5, transitionIn: null, stretchable: false }),
    ).toBe(false);
  });
});
