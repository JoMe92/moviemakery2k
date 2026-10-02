import { describe, expect, it } from "vitest";
import { canFitToMusic, fitToMusic, movieDurationWith } from "./fitToMusic";
import { buildTimeline, formatTime, type TimelineSlide } from "./timeline";

function slides(count: number, transition = 0, duration = 5): TimelineSlide[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    mediaId: `m${i}`,
    duration,
    transitionIn: i > 0 && transition > 0 ? { transitionId: "fade", duration: transition } : null,
  }));
}

function applied(input: TimelineSlide[], durations: number[]): TimelineSlide[] {
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
