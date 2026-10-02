import { describe, expect, it } from "vitest";
import { formatClipTime, parseClipTime } from "./clipTime";

describe("formatClipTime", () => {
  it.each([
    [0, "0:00,00", "0:00.00"],
    [192.4, "3:12,40", "3:12.40"],
    [10.5, "0:10,50", "0:10.50"],
    [3725.257, "1:02:05,26", "1:02:05.26"],
  ])("%d s", (seconds, de, en) => {
    expect(formatClipTime("de", seconds)).toBe(de);
    expect(formatClipTime("en", seconds)).toBe(en);
  });
});

describe("parseClipTime", () => {
  it.each([
    ["3:12", 192],
    ["3:12,40", 192.4],
    ["3:12.40", 192.4],
    ["0:10,5", 10.5],
    ["1:02:05.26", 3725.26],
    ["75", 75],
    ["75,5", 75.5],
    ["75.5", 75.5],
    ["10 s", 10],
    [" 0:05 ", 5],
  ])("%s → %d", (text, seconds) => {
    expect(parseClipTime(text)).toBeCloseTo(seconds, 9);
  });

  it.each(["", "abc", "-1", "1:60", "1:75:00", "1:2:3:4", "3,12,40", "1:"])(
    "rejects %j",
    (text) => {
      expect(parseClipTime(text)).toBeNull();
    },
  );
});
