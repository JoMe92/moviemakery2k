/**
 * Duration input in seconds (localization design.md D3): comma or dot as
 * decimal separator in both languages, optionally followed by a unit
 * ("1,5", "1.5", "2 s", "2 sec"). No range check.
 */
import { parseDecimal } from "../i18n/format";
import type { Locale } from "../i18n/locale";
import { translate } from "../i18n/t";

export function parseDuration(text: string): number | null {
  const cleaned = text.trim().replace(/\s*(s|sek|sekunden|sec|secs|seconds?)\.?$/i, "");
  return parseDecimal(cleaned);
}

/** Value for the input field, e.g. 1.25 → "1,25" (de) / "1.25" (en). */
export function durationInputValue(seconds: number, locale: Locale): string {
  const text = String(seconds);
  return locale === "de" ? text.replace(".", ",") : text;
}

/** Hint on the allowed range, e.g. "Allowed: 0.25 to 5 seconds in steps of 0.25." */
export function rangeMessage(
  range: { min: number; max: number; step: number },
  locale: Locale,
): string {
  const f = (n: number) => durationInputValue(n, locale);
  return translate(locale, "duration.range", {
    min: f(range.min),
    max: f(range.max),
    step: f(range.step),
  });
}
