/**
 * Message lookup with `{name}` placeholders and plurals (design.md D1).
 */
import { de } from "./de";
import { en } from "./en";
import type { Locale } from "./locale";
import type { MessageKey, Messages, MessageValue, Params, ParamsArg } from "./types";

export const CATALOGS: Readonly<Record<Locale, Messages>> = { de, en };

const pluralRules = new Map<Locale, Intl.PluralRules>();

function pluralRulesFor(locale: Locale): Intl.PluralRules {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules;
}

function lookup(messages: Messages, key: string): MessageValue | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === "string") return node;
  if (typeof node === "object" && node !== null && "other" in node) return node as MessageValue;
  return undefined;
}

/** Replaces `{name}` markers; unknown markers are left as they are. */
export function interpolate(template: string, params: Params | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (marker, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : marker,
  );
}

/**
 * Translates `key` into `locale`. Plural messages pick `one`/`other` from
 * `params.count`. A key missing at runtime (impossible for typed callers)
 * falls back to English, then to the key itself.
 */
export function translate<K extends MessageKey>(
  locale: Locale,
  key: K,
  ...[params]: ParamsArg<K>
): string {
  const value = lookup(CATALOGS[locale], key) ?? lookup(en, key);
  if (value === undefined) return key;
  let template: string;
  if (typeof value === "string") {
    template = value;
  } else {
    const count = Number(params?.count ?? 0);
    template = pluralRulesFor(locale).select(count) === "one" ? value.one : value.other;
  }
  return interpolate(template, params);
}

export type Translate = <K extends MessageKey>(key: K, ...params: ParamsArg<K>) => string;

/** `t()` bound to one locale. */
export function translator(locale: Locale): Translate {
  return (key, ...params) => translate(locale, key, ...params);
}

/** True if `key` names a plain (non-plural) message, e.g. a key built at runtime. */
export function isPlainMessageKey(key: string): key is MessageKey {
  return typeof lookup(en, key) === "string";
}

/** Translates a key built at runtime; falls back to `fallback` when it does not exist. */
export function translateDynamic(
  locale: Locale,
  key: string,
  params: Params,
  fallback: string,
): string {
  const value = lookup(CATALOGS[locale], key) ?? lookup(en, key);
  return typeof value === "string" ? interpolate(value, params) : fallback;
}
