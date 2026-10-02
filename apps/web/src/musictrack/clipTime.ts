/**
 * Time input of the "Trim…" dialog (spec music-track "Musikstücke bearbeiten"):
 * positions within an audio file as `m:ss,cc` (de) / `m:ss.cc` (en), from one
 * hour on `h:mm:ss,cc`. Input accepts that notation with comma or dot, or plain
 * seconds ("75", "75,5", "75.5 s") in either language.
 */
import { parseDecimal } from "../i18n/format";
import type { Locale } from "../i18n/locale";

const DECIMAL_SEPARATORS: Readonly<Record<Locale, string>> = { de: ",", en: "." };

/** E.g. 192.4 → "3:12,40" (de) / "3:12.40" (en); hundredths rounded. */
export function formatClipTime(locale: Locale, seconds: number): string {
  const totalCs = Math.max(0, Math.round(seconds * 100));
  const cs = totalCs % 100;
  const totalS = Math.floor(totalCs / 100);
  const s = totalS % 60;
  const m = Math.floor(totalS / 60) % 60;
  const h = Math.floor(totalS / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fraction = `${DECIMAL_SEPARATORS[locale]}${pad(cs)}`;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}${fraction}` : `${m}:${pad(s)}${fraction}`;
}

const CLOCK = /^(?:(\d+):)?(\d+):(\d{1,2})(?:[.,](\d+))?$/;

/**
 * Parses "m:ss", "m:ss,cc", "h:mm:ss.cc" or plain seconds with `,` or `.`
 * (optionally followed by a unit "s"/"sek"/"sec"). Returns null for anything
 * else, including seconds or minutes ≥ 60 in the clock notation.
 */
export function parseClipTime(text: string): number | null {
  const cleaned = text.trim().replace(/\s*(s|sek|sekunden|sec|secs|seconds?)\.?$/i, "");
  const clock = CLOCK.exec(cleaned);
  if (!clock) return parseDecimal(cleaned);
  const [, hours, minutes, seconds, fraction] = clock;
  const h = hours === undefined ? 0 : Number(hours);
  const m = Number(minutes);
  const s = Number(`${seconds}${fraction === undefined ? "" : `.${fraction}`}`);
  if (s >= 60 || (hours !== undefined && m >= 60)) return null;
  const value = h * 3600 + m * 60 + s;
  return Number.isFinite(value) ? value : null;
}
