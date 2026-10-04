import { describe, expect, it } from "vitest";
import { de } from "./de";
import { en } from "./en";
import { interpolate, translate } from "./t";
import type { Messages } from "./types";

describe("translate", () => {
  it("looks up plain messages per locale", () => {
    expect(translate("de", "common.cancel")).toBe("Abbrechen");
    expect(translate("en", "common.cancel")).toBe("Cancel");
  });

  it("fills placeholders", () => {
    expect(translate("de", "units.megabytes", { value: "3,4" })).toBe("ca. 3,4 MB");
    expect(translate("en", "units.megabytes", { value: "3.4" })).toBe("approx. 3.4 MB");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });

  it.each([
    ["de", 1, "1 Sekunde"],
    ["de", 2, "2 Sekunden"],
    ["de", 0, "0 Sekunden"],
    ["en", 1, "1 second"],
    ["en", 5, "5 seconds"],
    ["en", 0, "0 seconds"],
  ] as const)("plural %s count=%d → %s", (locale, count, expected) => {
    expect(translate(locale, "units.secondsCount", { count })).toBe(expected);
  });
});

/** Dotted leaf paths of a catalog; plural objects count as one leaf with their variants. */
function leaves(node: unknown, prefix = ""): [string, unknown][] {
  if (typeof node !== "object" || node === null) return [[prefix, node]];
  return Object.entries(node).flatMap(([key, value]) =>
    leaves(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("catalogs", () => {
  it("de and en have the same keys", () => {
    const keys = (m: Messages) => leaves(m).map(([k]) => k);
    expect(keys(de)).toEqual(keys(en));
  });

  it("have no empty values", () => {
    for (const catalog of [de, en]) {
      for (const [key, value] of leaves(catalog)) {
        expect(typeof value, key).toBe("string");
        expect((value as string).trim(), key).not.toBe("");
      }
    }
  });

  it("a catalog missing a key is a type error", () => {
    // Type-level check (runs under `pixi run typecheck`): dropping a key
    // from a catalog that `satisfies Messages` must not compile.
    const incomplete = {
      ...de,
      // @ts-expect-error -- `close` is missing
      common: { ok: "OK", cancel: "Abbrechen", yes: "Ja", no: "Nein", back: "<", next: ">" },
    } satisfies Messages;
    expect(incomplete.common.ok).toBe("OK");
  });

  it("an unknown key or a plural key without count is a type error", () => {
    // @ts-expect-error -- unknown key
    expect(translate("en", "common.nope")).toBe("common.nope");
    // @ts-expect-error -- plural keys require `count`
    expect(translate("en", "units.secondsCount")).toBe("{count} seconds");
  });
});
