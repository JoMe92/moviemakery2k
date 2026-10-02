/**
 * Reference message catalog (English, design.md D1). Its shape defines the
 * `Messages` type; every other catalog must provide exactly the same keys.
 *
 * Conventions:
 * - Keys are grouped by UI area (e.g. `common.ok`, later `menu.file.saveMovie`).
 * - `{name}` marks a placeholder filled from the `params` of `t()`.
 * - A plural message is an object `{ one, other }`; `t()` picks the variant via
 *   `Intl.PluralRules` from the required `count` param. Plain objects with
 *   exactly the keys `one` and `other` are reserved for plural messages.
 */
export const en = {
  app: {
    name: "moviemakerY2K",
  },
  language: {
    de: "Deutsch",
    en: "English",
  },
  common: {
    ok: "OK",
    cancel: "Cancel",
    close: "Close",
    yes: "Yes",
    no: "No",
    back: "< Back",
    next: "Next >",
  },
  units: {
    seconds: "{value} s",
    kilobytes: "approx. {value} KB",
    megabytes: "approx. {value} MB",
    secondsCount: { one: "{count} second", other: "{count} seconds" },
    minutesCount: { one: "{count} minute", other: "{count} minutes" },
  },
};
