/**
 * Locale-dependent formats (design.md D3): decimal numbers, the monitor time
 * display and decimal input.
 */
import type { Locale } from "./locale";

/** BCP 47 tag used for `Intl` formatting of each UI language. */
export const INTL_TAGS: Readonly<Record<Locale, string>> = { de: "de-DE", en: "en-US" };

const DECIMAL_SEPARATORS: Readonly<Record<Locale, string>> = { de: ",", en: "." };

const numberFormats = new Map<string, Intl.NumberFormat>();

/**
 * Formats `value` for `locale`. With `digits`, exactly that many fraction
 * digits are shown (`2.5`, 2 → "2,50" / "2.50"); otherwise `Intl` defaults apply.
 */
export function formatNumber(locale: Locale, value: number, digits?: number): string {
  const cacheKey = `${locale}|${digits ?? ""}`;
  let format = numberFormats.get(cacheKey);
  if (!format) {
    format = new Intl.NumberFormat(
      INTL_TAGS[locale],
      digits === undefined ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits },
    );
    numberFormats.set(cacheKey, format);
  }
  return format.format(value);
}

/** Monitor time display: `h:mm:ss,cc` (de) or `h:mm:ss.cc` (en), hundredths rounded. */
export function formatTime(locale: Locale, seconds: number): string {
  const totalCs = Math.max(0, Math.round(seconds * 100));
  const cs = totalCs % 100;
  const totalS = Math.floor(totalCs / 100);
  const s = totalS % 60;
  const m = Math.floor(totalS / 60) % 60;
  const h = Math.floor(totalS / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}${DECIMAL_SEPARATORS[locale]}${pad(cs)}`;
}

/**
 * Parses a non-negative decimal number with `,` or `.` as decimal separator in
 * either language ("2,5", "2.5", ".5"). Returns null for anything else
 * (thousands separators are not accepted).
 */
export function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
