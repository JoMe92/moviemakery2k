/**
 * Choice of the UI language (design.md D2): stored setting → browser
 * languages (first entry starting with `de` or `en`) → `en`.
 */

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
/** localStorage key of the language chosen in Tools → Options. */
export const LOCALE_STORAGE_KEY = "mmy.locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Maps a BCP 47 tag such as `de-AT` to a supported locale, or null. */
export function localeOfTag(tag: string): Locale | null {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(primary) ? primary : null;
}

export function detectLocale(
  stored: string | null | undefined,
  languages: readonly string[] | undefined,
): Locale {
  if (isLocale(stored)) return stored;
  for (const tag of languages ?? []) {
    const locale = localeOfTag(tag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

/** Stored locale, or null if none is stored or storage is unavailable. */
export function readStoredLocale(): string | null {
  try {
    return globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Persists the locale; failures (private mode, quota) are ignored. */
export function writeStoredLocale(locale: Locale): void {
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The choice then only lasts for this session.
  }
}

/** Preferred browser languages, most preferred first. */
export function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages && navigator.languages.length > 0) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/** Locale at startup: stored setting, then browser, then English. */
export function initialLocale(): Locale {
  return detectLocale(readStoredLocale(), browserLanguages());
}

/** Keeps `<html lang>` in sync with the UI language. */
export function applyDocumentLocale(locale: Locale): void {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}
