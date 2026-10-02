/**
 * The inline script in `index.html` sets `<html lang>` before the app loads
 * (harden-export-and-ui design.md D8). It must follow the same rule as
 * `detectLocale`; this test runs it against the same cases.
 */
import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import { detectLocale } from "./locale";

function inlineScript(): string {
  const match = /<script>([\s\S]*?)<\/script>/.exec(indexHtml);
  if (!match) throw new Error("index.html has no inline script");
  return match[1] ?? "";
}

function runInlineScript(stored: string | null, languages: readonly string[]): string {
  const documentElement = { lang: "" };
  const window = {
    localStorage: { getItem: (key: string) => (key === "mmy.locale" ? stored : null) },
  };
  const navigator = { languages, language: languages[0] ?? "" };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("window", "navigator", "document", inlineScript())(window, navigator, {
    documentElement,
  });
  return documentElement.lang;
}

describe("index.html inline language script", () => {
  it("defaults to lang=en before any script runs", () => {
    expect(indexHtml).toMatch(/<html lang="en">/);
  });

  it.each([
    ["en", ["de-DE"]],
    ["de", ["en-US"]],
    [null, ["de-AT"]],
    [null, ["fr-FR"]],
    [null, ["en-US"]],
    [null, ["fr-FR", "de-CH", "en-GB"]],
    [null, []],
    ["fr", ["de-DE"]],
  ] as const)("stored %s, browser %j → same as detectLocale", (stored, languages) => {
    expect(runInlineScript(stored, languages)).toBe(detectLocale(stored, languages));
  });

  it("falls back to the browser languages when storage throws", () => {
    const documentElement = { lang: "" };
    const window = {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function("window", "navigator", "document", inlineScript())(
      window,
      { languages: ["de-DE"], language: "de-DE" },
      { documentElement },
    );
    expect(documentElement.lang).toBe("de");
  });
});
