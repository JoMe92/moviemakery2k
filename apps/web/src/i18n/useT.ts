/**
 * React access to the UI language (design.md D2): `t()` and formatters bound
 * to the locale in the store; components re-render when it changes.
 */
import { useContext, useMemo, useSyncExternalStore } from "react";
import { AppStoreContext } from "../store/useAppStore";
import { formatNumber, formatTime } from "./format";
import { initialLocale, type Locale } from "./locale";
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

const noSubscription = () => () => {};

/**
 * Without a store (shared UI components rendered on their own, e.g. in unit
 * tests) the startup locale is used: stored setting → browser → `en`.
 */
export function useT(): LocaleTools {
  const store = useContext(AppStoreContext);
  const locale = useSyncExternalStore(store ? store.subscribe : noSubscription, () =>
    store ? store.getState().locale : initialLocale(),
  );
  return useMemo(() => localeTools(locale), [locale]);
}
