import { describe, expect, it } from "vitest";
import { detectLocale, LOCALE_STORAGE_KEY, readStoredLocale } from "./locale";

describe("detectLocale", () => {
  it.each([
    ["stored setting wins over the browser", "en", ["de-DE"], "en"],
    ["stored German wins too", "de", ["en-US"], "de"],
    ["de-AT → de", null, ["de-AT"], "de"],
    ["fr-FR → en", null, ["fr-FR"], "en"],
    ["en-US → en", null, ["en-US"], "en"],
    ["first supported entry counts", null, ["fr-FR", "de-CH", "en-GB"], "de"],
    ["no languages → en", null, [], "en"],
    ["undefined languages → en", undefined, undefined, "en"],
    ["invalid stored value is ignored", "fr", ["de-DE"], "de"],
  ] as const)("%s", (_name, stored, languages, expected) => {
    expect(detectLocale(stored, languages)).toBe(expected);
  });
});

describe("readStoredLocale", () => {
  it("reads mmy.locale", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    expect(readStoredLocale()).toBe("en");
  });
});
