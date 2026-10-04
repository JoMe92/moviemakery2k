import { describe, expect, it } from "vitest";
import type { MusicClip, Slide } from "../lib/apiClient";
import { formatDuration, insertionIndex, musicInsertionIndex, resolveDrop } from "./dropLogic";

const s = (id: string): Slide => ({
  kind: "image",
  id,
  mediaId: `m${id}`,
  duration: 5,
  effectId: null,
  transitionIn: null,
});
const slides = [s("1"), s("2"), s("3")];
const media = { type: "media", mediaId: "x" } as const;

describe("dropLogic", () => {
  it("Spec: picture between first and second item → position 2", () => {
    expect(resolveDrop(media, { type: "slide", slideId: "1", after: true }, slides)).toEqual({
      kind: "insert",
      mediaId: "x",
      index: 1,
    });
    expect(resolveDrop(media, { type: "slide", slideId: "2", after: false }, slides)).toEqual({
      kind: "insert",
      mediaId: "x",
      index: 1,
    });
  });

  it("appends after the last tile and in the empty storyboard", () => {
    expect(insertionIndex({ type: "slide", slideId: "3", after: true }, slides)).toBe(3);
    expect(insertionIndex({ type: "strip" }, slides)).toBe(3);
    expect(insertionIndex({ type: "strip" }, [])).toBe(0);
    expect(insertionIndex(null, slides)).toBeNull();
    expect(insertionIndex({ type: "slide", slideId: "weg", after: false }, slides)).toBeNull();
  });

  it("Spec: third item to the first position", () => {
    expect(
      resolveDrop(
        { type: "slide", slideId: "3" },
        { type: "slide", slideId: "1", after: false },
        slides,
      ),
    ).toEqual({ kind: "move", from: 2, to: 0 });
  });

  it("reordering into the empty space after the tiles → to the end; no target/onto itself → nothing", () => {
    expect(resolveDrop({ type: "slide", slideId: "1" }, { type: "strip" }, slides)).toEqual({
      kind: "move",
      from: 0,
      to: 2,
    });
    expect(resolveDrop({ type: "slide", slideId: "1" }, null, slides)).toEqual({ kind: "none" });
    expect(
      resolveDrop(
        { type: "slide", slideId: "2" },
        { type: "slide", slideId: "2", after: true },
        slides,
      ),
    ).toEqual({ kind: "none" });
  });

  it("formats durations in German with two decimal places", () => {
    expect(formatDuration(5, "de")).toBe("5,00 s");
    expect(formatDuration(2.25, "de")).toBe("2,25 s");
    expect(formatDuration(2.5, "en")).toBe("2.50 s");
  });

  it("Spec: video between first and second picture → position 2", () => {
    const video = { type: "video", mediaId: "clip" } as const;
    expect(resolveDrop(video, { type: "slide", slideId: "1", after: true }, slides)).toEqual({
      kind: "insert",
      mediaId: "clip",
      index: 1,
    });
    expect(resolveDrop(video, { type: "slide", slideId: "2", after: false }, slides)).toEqual({
      kind: "insert",
      mediaId: "clip",
      index: 1,
    });
    expect(resolveDrop(video, { type: "strip" }, slides)).toEqual({
      kind: "insert",
      mediaId: "clip",
      index: 3,
    });
  });

  it("transition onto a slot → set (replaces); not on the first picture, not on tiles", () => {
    const t = { type: "transition", transitionId: "circle" } as const;
    expect(resolveDrop(t, { type: "transitionSlot", slideId: "2" }, slides)).toEqual({
      kind: "setTransition",
      slideId: "2",
      transitionId: "circle",
    });
    expect(resolveDrop(t, { type: "transitionSlot", slideId: "1" }, slides)).toEqual({
      kind: "none",
    });
    expect(resolveDrop(t, { type: "slide", slideId: "2", after: false }, slides)).toEqual({
      kind: "none",
    });
    expect(resolveDrop(t, { type: "strip" }, slides)).toEqual({ kind: "none" });
    expect(resolveDrop(media, { type: "transitionSlot", slideId: "2" }, slides)).toEqual({
      kind: "none",
    });
    expect(insertionIndex({ type: "transitionSlot", slideId: "2" }, slides)).toBeNull();
  });
});

describe("dropLogic: music track", () => {
  const c = (id: string): MusicClip => ({
    id,
    mediaId: `a${id}`,
    trimStart: 0,
    trimEnd: null,
    volume: 1,
    fadeIn: false,
    fadeOut: false,
  });
  const music = [c("1"), c("2")];
  const audio = { type: "audio", mediaId: "song" } as const;

  it("inserts audio at the marker or at the end of the track", () => {
    expect(resolveDrop(audio, { type: "musicClip", clipId: "1", after: true }, [], music)).toEqual({
      kind: "insertMusic",
      mediaId: "song",
      index: 1,
    });
    expect(resolveDrop(audio, { type: "musicStrip" }, [], music)).toEqual({
      kind: "insertMusic",
      mediaId: "song",
      index: 2,
    });
    expect(musicInsertionIndex({ type: "musicStrip" }, [])).toBe(0);
    expect(musicInsertionIndex({ type: "strip" }, music)).toBeNull();
  });

  it("refuses audio on the storyboard and pictures or video on the music track", () => {
    for (const target of [
      { type: "strip" },
      { type: "slide", slideId: "1", after: false },
      { type: "transitionSlot", slideId: "2" },
    ] as const) {
      expect(resolveDrop(audio, target, slides, music)).toEqual({
        kind: "reject",
        reason: "audioOnStoryboard",
      });
    }
    expect(resolveDrop(media, { type: "musicStrip" }, slides, music)).toEqual({
      kind: "reject",
      reason: "pictureOnMusic",
    });
    expect(
      resolveDrop({ type: "video", mediaId: "clip" }, { type: "musicStrip" }, slides, music),
    ).toEqual({ kind: "reject", reason: "pictureOnMusic" });
    expect(resolveDrop({ type: "slide", slideId: "1" }, { type: "musicStrip" }, slides)).toEqual({
      kind: "none",
    });
  });

  it("reorders clips on the music track only", () => {
    const item = { type: "music", clipId: "2" } as const;
    expect(
      resolveDrop(item, { type: "musicClip", clipId: "1", after: false }, slides, music),
    ).toEqual({ kind: "moveMusic", from: 1, to: 0 });
    expect(resolveDrop(item, { type: "musicStrip" }, slides, music)).toEqual({ kind: "none" });
    expect(resolveDrop(item, { type: "strip" }, slides, music)).toEqual({ kind: "none" });
  });
});
