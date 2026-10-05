/**
 * The two new audio schedules and the global level (add-narration-and-audio-
 * levels design.md D1, D2 and D4). The music schedule keeps its own shared
 * vectors (`musicVectors.test.ts`); what is checked here is where narration and
 * video-clip sound land, and that both go through the same movie-end rules.
 */
import { describe, expect, it } from "vitest";
import {
  type AudioSegment,
  atGain,
  audioBalanceGains,
  type MediaDurations,
  type NarrationClipInput,
  narrationSchedule,
  videoClipAudioSchedule,
} from "./audio";

const DURATIONS: MediaDurations = { rec: 10, short: 0.4 };

function clip(id: string, at: number, partial: Partial<NarrationClipInput> = {}) {
  return {
    id,
    mediaId: "rec",
    at,
    trimStart: 0,
    trimEnd: 3,
    volume: 1,
    fadeIn: false,
    fadeOut: false,
    ...partial,
  } satisfies NarrationClipInput;
}

const times = (segments: AudioSegment[]) => segments.map((s) => [s.at, s.length]);

describe("narrationSchedule", () => {
  it("Spec: a clip is audible only in its own window, wherever the filmstrip is", () => {
    const [segment, ...rest] = narrationSchedule([clip("n1", 5)], DURATIONS, 60);
    expect(rest).toEqual([]);
    expect(segment).toEqual({
      mediaId: "rec",
      at: 5,
      sourceIn: 0,
      length: 3,
      gain: 1,
      fadeIn: 0,
      fadeOut: 0,
    });
  });

  it("Spec: overlapping clips both survive, neither is shortened or dropped", () => {
    const segments = narrationSchedule([clip("n1", 4), clip("n2", 5)], DURATIONS, 60);
    expect(times(segments)).toEqual([
      [4, 3],
      [5, 3],
    ]);
  });

  it("takes each `at` as it stands instead of chaining the clips", () => {
    // Out of order, with a gap: list order changes nothing about the times.
    const segments = narrationSchedule([clip("n1", 20), clip("n2", 2)], DURATIONS, 60);
    expect(times(segments)).toEqual([
      [20, 3],
      [2, 3],
    ]);
  });

  it("carries trim, volume and the two fades of a clip", () => {
    const [segment] = narrationSchedule(
      [clip("n1", 1, { trimStart: 2, trimEnd: 6, volume: 1.5, fadeIn: true, fadeOut: true })],
      DURATIONS,
      60,
    );
    expect(segment).toEqual({
      mediaId: "rec",
      at: 1,
      sourceIn: 2,
      length: 4,
      gain: 1.5,
      fadeIn: 1,
      fadeOut: 1,
    });
  });

  it("drops a clip that starts at or after the movie end, whatever follows it", () => {
    const segments = narrationSchedule([clip("n1", 12), clip("n2", 3)], DURATIONS, 12);
    expect(times(segments)).toEqual([[3, 3]]);
  });

  it("cuts a clip at the movie end and fades it out there instead of its own fade", () => {
    const [segment] = narrationSchedule([clip("n1", 10, { fadeOut: true })], DURATIONS, 12);
    expect(segment).toMatchObject({ at: 10, length: 2, fadeOut: 1 });
  });

  it("shortens the end fade to the segment when that is shorter than a second", () => {
    const [segment] = narrationSchedule([clip("n1", 0, { trimEnd: null })], DURATIONS, 0.5);
    expect(segment).toMatchObject({ at: 0, length: 0.5, fadeOut: 0.5 });
  });

  it("drops a clip whose medium is unknown or whose range plays nothing", () => {
    const clips = [
      clip("n1", 0, { mediaId: "gone" }),
      clip("n2", 1, { trimStart: 3, trimEnd: 3 }),
      clip("n3", 2, { mediaId: "short", trimEnd: null }),
    ];
    expect(narrationSchedule(clips, DURATIONS, 60)).toEqual([
      // Only the 0.4 s medium is audible; a zero-length range yields nothing.
      { mediaId: "short", at: 2, sourceIn: 0, length: 0.4, gain: 1, fadeIn: 0, fadeOut: 0 },
    ]);
  });

  it("yields nothing without a movie", () => {
    expect(narrationSchedule([clip("n1", 0)], DURATIONS, 0)).toEqual([]);
    expect(narrationSchedule([clip("n1", 0)], DURATIONS, Number.NaN)).toEqual([]);
  });
});

describe("videoClipAudioSchedule", () => {
  it("plays the trim range of the element where the timeline put it, at full gain", () => {
    const segments = videoClipAudioSchedule([{ mediaId: "v", at: 2.5, trimIn: 4, trimOut: 9 }], 60);
    expect(segments).toEqual([
      { mediaId: "v", at: 2.5, sourceIn: 4, length: 5, gain: 1, fadeIn: 0, fadeOut: 0 },
    ]);
  });

  it("keeps the overlap two elements have while a transition runs", () => {
    const segments = videoClipAudioSchedule(
      [
        { mediaId: "a", at: 0, trimIn: 0, trimOut: 4 },
        // A 1 s transition pulls the second element 1 s into the first.
        { mediaId: "b", at: 3, trimIn: 0, trimOut: 4 },
      ],
      7,
    );
    expect(times(segments)).toEqual([
      [0, 4],
      [3, 4],
    ]);
  });

  it("has no fades of its own, only the movie-end one", () => {
    const [segment] = videoClipAudioSchedule([{ mediaId: "v", at: 0, trimIn: 0, trimOut: 5 }], 5);
    expect(segment).toMatchObject({ fadeIn: 0, fadeOut: 1 });
  });

  it("drops an element with an empty range", () => {
    expect(videoClipAudioSchedule([{ mediaId: "v", at: 0, trimIn: 2, trimOut: 2 }], 60)).toEqual(
      [],
    );
  });
});

describe("audioBalanceGains", () => {
  it.each([
    [0, 0, 1],
    [25, 0.5, 1],
    [50, 1, 1],
    [75, 1, 0.5],
    [100, 1, 0],
  ])("level %s mutes neither side more than it has to", (balance, clipGain, musicGain) => {
    expect(audioBalanceGains(balance)).toEqual({ clip: clipGain, musicAndNarration: musicGain });
  });

  it("clamps a value outside the range and falls back to the middle", () => {
    expect(audioBalanceGains(-10)).toEqual({ clip: 0, musicAndNarration: 1 });
    expect(audioBalanceGains(200)).toEqual({ clip: 1, musicAndNarration: 0 });
    expect(audioBalanceGains(Number.NaN)).toEqual({ clip: 1, musicAndNarration: 1 });
  });
});

describe("atGain", () => {
  const segments: AudioSegment[] = [
    { mediaId: "a", at: 0, sourceIn: 0, length: 2, gain: 0.5, fadeIn: 0, fadeOut: 0 },
  ];

  it("scales every gain", () => {
    expect(atGain(segments, 0.5)[0]?.gain).toBe(0.25);
  });

  it("drops a silent track instead of scheduling inaudible voices", () => {
    expect(atGain(segments, 0)).toEqual([]);
  });

  it("copies the list unchanged at full gain", () => {
    const same = atGain(segments, 1);
    expect(same).toEqual(segments);
    expect(same).not.toBe(segments);
  });
});
