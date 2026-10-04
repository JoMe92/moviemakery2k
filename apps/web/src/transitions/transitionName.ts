/**
 * Display names of catalog transitions per UI language (localization design.md D4).
 */
import type { Locale } from "../i18n/locale";
import type { Transition } from "../lib/apiClient";

/** Name of a catalog entry in the UI language. */
export function transitionName(entry: Pick<Transition, "names">, locale: Locale): string {
  return entry.names[locale];
}

/** Name of the transition `id` in `catalog`; falls back to the ID for unknown entries. */
export function catalogName(catalog: readonly Transition[], id: string, locale: Locale): string {
  const entry = catalog.find((t) => t.id === id);
  return entry ? transitionName(entry, locale) : id;
}
