/**
 * Display names of catalog effects per UI language (add-effects-catalog
 * design.md D1; localization design.md D4) - same shape as transitionName.ts.
 */
import type { Locale } from "../i18n/locale";
import type { Effect } from "../lib/apiClient";

/** Name of a catalog entry in the UI language. */
export function entryName(entry: Pick<Effect, "names">, locale: Locale): string {
  return entry.names[locale];
}

/** Name of the effect `id` in `catalog`; falls back to the ID for unknown entries. */
export function effectName(catalog: readonly Effect[], id: string, locale: Locale): string {
  const entry = catalog.find((e) => e.id === id);
  return entry ? entryName(entry, locale) : id;
}
