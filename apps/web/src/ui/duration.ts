/**
 * Eingabe von Dauern in Sekunden: Komma oder Punkt als Dezimaltrenner,
 * optional mit „s“ dahinter („1,5“, „1.5“, „2 s“). Keine Bereichsprüfung.
 */
export function parseDuration(text: string): number | null {
  const cleaned = text
    .trim()
    .replace(/\s*(s|sek|sekunden)\.?$/i, "")
    .replace(",", ".");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Wert für das Eingabefeld, z. B. 1.25 → „1,25“. */
export function durationInputValue(seconds: number): string {
  return String(seconds).replace(".", ",");
}

/** Hinweis zum erlaubten Bereich, z. B. „Erlaubt sind 0,25 bis 5 Sekunden in Schritten von 0,25.“ */
export function rangeMessage(range: { min: number; max: number; step: number }): string {
  const f = durationInputValue;
  return `Erlaubt sind ${f(range.min)} bis ${f(range.max)} Sekunden in Schritten von ${f(range.step)}.`;
}
