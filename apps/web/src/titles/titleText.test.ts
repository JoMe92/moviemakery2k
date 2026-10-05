import { describe, expect, it } from "vitest";
import openapi from "../generated/openapi.json";
import { limitCreditsText, limitTitleLine, TITLE_LINE_MAX_LENGTH } from "./titleText";

/** The generated API contract, narrowed to the part this test walks. */
const contract = openapi as unknown as {
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
};

/**
 * Every `maxLength` the contract states for a string inside `node` - a title
 * line sits one `items` level below its property, and `lines` is additionally
 * wrapped in an `anyOf` because it is nullable, so the test walks the subtree
 * instead of hard-coding that shape.
 */
function stringMaxLengths(node: unknown, found: number[] = []): number[] {
  if (Array.isArray(node)) {
    for (const item of node) stringMaxLengths(item, found);
    return found;
  }
  if (node === null || typeof node !== "object") return found;
  const record = node as Record<string, unknown>;
  if (record.type === "string" && typeof record.maxLength === "number")
    found.push(record.maxLength);
  for (const value of Object.values(record)) stringMaxLengths(value, found);
  return found;
}

function propertySchema(schema: string, property: string): unknown {
  const found = contract.components.schemas[schema]?.properties?.[property];
  expect(found, `${schema}.${property} in openapi.json`).toBeDefined();
  return found;
}

describe("title text limit (TASK-WEB-078, design.md D1, spec titles-and-credits)", () => {
  // Mirrors the backend's TITLE_LINE_MAX_LENGTH: if a session moves the limit
  // in project.py, `pixi run gen-api` moves the number below and this fails.
  it.each([
    ["TitleSlide", "lines"],
    ["TitleSlide", "creditEntries"],
    ["TitleOverlay", "lines"],
  ])("matches the %s.%s limit of the generated API contract", (schema, property) => {
    const limits = stringMaxLengths(propertySchema(schema, property));
    expect(limits.length).toBeGreaterThan(0);
    for (const limit of limits) expect(limit).toBe(TITLE_LINE_MAX_LENGTH);
  });

  it("leaves a line at or below the limit untouched", () => {
    const exact = "x".repeat(TITLE_LINE_MAX_LENGTH);
    expect(limitTitleLine("")).toBe("");
    expect(limitTitleLine("Mein Film")).toBe("Mein Film");
    expect(limitTitleLine(exact)).toBe(exact);
  });

  it("cuts a longer line to the limit", () => {
    const line = limitTitleLine("a".repeat(500));
    expect(line).toHaveLength(TITLE_LINE_MAX_LENGTH);
    expect(line).toBe("a".repeat(TITLE_LINE_MAX_LENGTH));
  });

  it("never cuts a surrogate pair in half", () => {
    // The 200th and 201st code unit are the halves of one emoji.
    const line = limitTitleLine(`${"a".repeat(TITLE_LINE_MAX_LENGTH - 1)}🎬tail`);
    expect(line).toBe("a".repeat(TITLE_LINE_MAX_LENGTH - 1));
  });

  it("limits each credits entry on its own and leaves the others alone", () => {
    const text = limitCreditsText(`Regie: Ich\n${"b".repeat(500)}\nKamera: Auch ich`);
    expect(text.split("\n")).toEqual([
      "Regie: Ich",
      "b".repeat(TITLE_LINE_MAX_LENGTH),
      "Kamera: Auch ich",
    ]);
  });

  it("keeps a credits text whose entries all fit, empty lines included", () => {
    const text = `Regie: Ich\n\n${"b".repeat(TITLE_LINE_MAX_LENGTH)}\n`;
    expect(limitCreditsText(text)).toBe(text);
  });
});
