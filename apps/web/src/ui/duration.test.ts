import { describe, expect, it } from "vitest";
import { SLIDE_DURATION, TRANSITION_DURATION } from "../store/projectOps";
import { durationInputValue, parseDuration, rangeMessage } from "./duration";

describe("parseDuration", () => {
  it.each([
    ["1,5", 1.5],
    ["1.5", 1.5],
    [" 2 ", 2],
    ["2,25 s", 2.25],
    ["0,1", 0.1],
    [",5", 0.5],
    ["60", 60],
    ["2.5 sec", 2.5],
  ])("„%s“ → %s", (text, value) => {
    expect(parseDuration(text)).toBe(value);
  });

  it.each(["", "abc", "1,2,3", "-1", "1e3", "1,", "zwei"])("„%s“ → null", (text) => {
    expect(parseDuration(text)).toBeNull();
  });

  it("formatiert Eingabewerte und Bereichshinweise deutsch", () => {
    expect(durationInputValue(1.25, "de")).toBe("1,25");
    expect(rangeMessage(SLIDE_DURATION, "de")).toBe(
      "Erlaubt sind 0,5 bis 60 Sekunden in Schritten von 0,25.",
    );
    expect(rangeMessage(TRANSITION_DURATION, "de")).toBe(
      "Erlaubt sind 0,25 bis 5 Sekunden in Schritten von 0,25.",
    );
  });

  it("formatiert Eingabewerte und Bereichshinweise englisch", () => {
    expect(durationInputValue(1.25, "en")).toBe("1.25");
    expect(rangeMessage(SLIDE_DURATION, "en")).toBe(
      "Allowed are 0.5 to 60 seconds in steps of 0.25.",
    );
  });
});
