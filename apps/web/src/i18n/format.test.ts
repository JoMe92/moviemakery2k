import { describe, expect, it } from "vitest";
import { formatNumber, formatTime, parseDecimal } from "./format";

describe("formatTime", () => {
  it.each([
    [12.5, "0:00:12,50", "0:00:12.50"],
    [0, "0:00:00,00", "0:00:00.00"],
    [3725.257, "1:02:05,26", "1:02:05.26"],
  ])("%d s", (seconds, de, en) => {
    expect(formatTime("de", seconds)).toBe(de);
    expect(formatTime("en", seconds)).toBe(en);
  });
});

describe("formatNumber", () => {
  it("uses the decimal separator of the locale", () => {
    expect(formatNumber("de", 2.5, 2)).toBe("2,50");
    expect(formatNumber("en", 2.5, 2)).toBe("2.50");
    expect(formatNumber("de", 3.44, 1)).toBe("3,4");
    expect(formatNumber("en", 1.25)).toBe("1.25");
  });
});

describe("parseDecimal", () => {
  it.each([
    ["2,5", 2.5],
    ["2.5", 2.5],
    [" 3 ", 3],
    [".5", 0.5],
    ["", null],
    ["abc", null],
    ["1.000,5", null],
    ["-1", null],
  ])("%j → %j", (text, expected) => {
    expect(parseDecimal(text)).toBe(expected);
  });
});
