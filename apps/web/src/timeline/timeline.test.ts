import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  formatTime,
  frameAt,
  slideIndexAt,
  slideStartTime,
  type TimelineSlide,
} from "./timeline";

const slide = (
  id: string,
  duration = 5,
  transition: [string, number] | null = null,
): TimelineSlide => ({
  id,
  mediaId: `m-${id}`,
  duration,
  transitionIn: transition ? { transitionId: transition[0], duration: transition[1] } : null,
});

describe("buildTimeline", () => {
  it("leeres Projekt hat Dauer 0 und zeigt nichts", () => {
    const tl = buildTimeline([]);
    expect(tl.duration).toBe(0);
    expect(frameAt(tl, 0)).toEqual({ kind: "empty" });
  });

  it("Spec: drei Bilder à 5 s mit zwei Übergängen à 1,25 s dauern 12,50 s", () => {
    const tl = buildTimeline([
      slide("a"),
      slide("b", 5, ["fade", 1.25]),
      slide("c", 5, ["circle", 1.25]),
    ]);
    expect(tl.duration).toBeCloseTo(12.5);
    expect(formatTime(tl.duration)).toBe("0:00:12,50");
  });

  it("harte Schnitte addieren nur die Bilddauern", () => {
    const tl = buildTimeline([slide("a", 2), slide("b", 3)]);
    expect(tl.duration).toBe(5);
    expect(tl.segments.map((s) => s.kind)).toEqual(["still", "still"]);
  });

  it("Spec: 4-s-Übergang zwischen 2-s-Bildern wirkt 1 s", () => {
    const tl = buildTimeline([slide("a", 2), slide("b", 2, ["fade", 4])]);
    expect(tl.slides[1]?.transitionIn).toBe(1);
    expect(tl.duration).toBe(3);
    const tr = tl.segments.find((s) => s.kind === "transition");
    expect(tr).toMatchObject({ start: 1, end: 2, fromIndex: 0, toIndex: 1 });
  });

  it("ein transitionIn am ersten Bild wird ignoriert", () => {
    const tl = buildTimeline([slide("a", 5, ["fade", 1])]);
    expect(tl.duration).toBe(5);
    expect(tl.segments).toEqual([{ kind: "still", slideIndex: 0, start: 0, end: 5 }]);
  });

  it("Segmente sind lückenlos und decken die Gesamtdauer ab", () => {
    const tl = buildTimeline([
      slide("a", 3),
      slide("b", 1, ["fade", 5]),
      slide("c", 4, ["wipe-right", 1]),
      slide("d", 0.5, ["dissolve", 0.25]),
    ]);
    let cursor = 0;
    for (const seg of tl.segments) {
      expect(seg.start).toBeCloseTo(cursor);
      expect(seg.end).toBeGreaterThan(seg.start);
      cursor = seg.end;
    }
    expect(cursor).toBeCloseTo(tl.duration);
  });
});

describe("frameAt", () => {
  const tl = buildTimeline([slide("a"), slide("b", 5, ["fade", 2])]);
  // a: 0–5, Übergang 3–5, b voll ab 5, Ende 8

  it("zeigt vor dem Übergang das erste Bild", () => {
    expect(frameAt(tl, 1)).toEqual({ kind: "still", slideIndex: 0 });
  });

  it("Spec: Suchen mitten im Übergang liefert den Zwischenzustand", () => {
    expect(frameAt(tl, 4)).toEqual({
      kind: "transition",
      fromIndex: 0,
      toIndex: 1,
      transitionId: "fade",
      progress: 0.5,
    });
  });

  it("Übergangsbeginn hat progress 0", () => {
    expect(frameAt(tl, 3)).toMatchObject({ kind: "transition", progress: 0 });
  });

  it("am Ende und danach bleibt das letzte Bild stehen", () => {
    expect(frameAt(tl, 8)).toEqual({ kind: "still", slideIndex: 1 });
    expect(frameAt(tl, 99)).toEqual({ kind: "still", slideIndex: 1 });
    expect(frameAt(tl, -3)).toEqual({ kind: "still", slideIndex: 0 });
  });

  it("aktives Bild während des Übergangs ist das Zielbild", () => {
    expect(slideIndexAt(tl, 4)).toBe(1);
    expect(slideIndexAt(tl, 2)).toBe(0);
  });
});

describe("slideStartTime", () => {
  it("Spec: „Nächstes Bild“ springt ans Ende des Übergangs dorthin", () => {
    const tl = buildTimeline([
      slide("a"),
      slide("b", 5, ["fade", 1.25]),
      slide("c", 5, ["fade", 1.25]),
    ]);
    // b beginnt bei 3,75, voll sichtbar ab 5,0; c beginnt 7,5, voll ab 8,75
    expect(slideStartTime(tl, 1)).toBeCloseTo(5);
    expect(slideStartTime(tl, 2)).toBeCloseTo(8.75);
    expect(frameAt(tl, slideStartTime(tl, 2))).toEqual({ kind: "still", slideIndex: 2 });
  });
});

describe("formatTime", () => {
  it.each([
    [0, "0:00:00,00"],
    [3.25, "0:00:03,25"],
    [61.999, "0:01:02,00"],
    [3600 + 125.5, "1:02:05,50"],
  ])("%s s → %s", (s, out) => {
    expect(formatTime(s)).toBe(out);
  });
});
