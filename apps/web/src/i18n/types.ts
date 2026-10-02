/**
 * Types derived from the English reference catalog (design.md D1).
 */
import type { en } from "./en";

/** Variants of a plural message, chosen via `Intl.PluralRules` (`one`/`other`). */
export interface PluralMessage {
  one: string;
  other: string;
}

/** A translatable leaf: plain text or a plural message. */
export type MessageValue = string | PluralMessage;

/** Shape every catalog must satisfy: the reference catalog with string leaves. */
export type Messages = typeof en;

type Join<P extends string, K extends string> = P extends "" ? K : `${P}.${K}`;

/** Dotted paths to all leaves of `T`, e.g. `"common.ok"`. */
type LeafPaths<T, Leaf, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends PluralMessage
    ? PluralMessage extends Leaf
      ? Join<P, K>
      : never
    : T[K] extends string
      ? string extends Leaf
        ? Join<P, K>
        : never
      : LeafPaths<T[K], Leaf, Join<P, K>>;
}[keyof T & string];

/** Every message key (dotted path), e.g. `"common.cancel"`. */
export type MessageKey = LeafPaths<Messages, MessageValue>;
/** Keys of plural messages; they require a `count` param. */
export type PluralKey = LeafPaths<Messages, PluralMessage>;

/** Placeholder values for `{name}` markers. */
export type Params = Readonly<Record<string, string | number>>;

/** Parameters for `t()`: required with `count` for plural keys, optional otherwise. */
export type ParamsArg<K extends MessageKey> = K extends PluralKey
  ? [params: Params & { readonly count: number }]
  : [params?: Params];
