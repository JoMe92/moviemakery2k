/**
 * React access to the UI language (design.md D2): `t()` and formatters bound
 * to the locale in the store; components re-render when it changes.
 */
import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { formatNumber, formatTime } from "./format";
import type { Locale } from "./locale";
import { type Translate, translator } from "./t";

export interface LocaleTools {
  t: Translate;
  locale: Locale;
  formatNumber(value: number, digits?: number): string;
  formatTime(seconds: number): string;
}

export function localeTools(locale: Locale): LocaleTools {
  return {
    t: translator(locale),
    locale,
    formatNumber: (value, digits) => formatNumber(locale, value, digits),
    formatTime: (seconds) => formatTime(locale, seconds),
  };
}

export function useT(): LocaleTools {
  const locale = useAppStore((s) => s.locale);
  return useMemo(() => localeTools(locale), [locale]);
}
