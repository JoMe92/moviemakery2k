import { describe, expect, it } from "vitest";
import { matchShortcut } from "./globalShortcuts";

const el = (html: string) => {
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  document.body.append(wrap);
  return wrap.firstElementChild as HTMLElement;
};

describe("global shortcuts (design.md D3)", () => {
  const ctx = { dragging: false };

  it("Strg+Z is undo, Strg+Y and Strg+Umschalt+Z are redo", () => {
    expect(matchShortcut({ key: "z", ctrlKey: true, target: document.body }, ctx)).toBe("undo");
    expect(matchShortcut({ key: "y", ctrlKey: true, target: document.body }, ctx)).toBe("redo");
    expect(
      matchShortcut({ key: "z", ctrlKey: true, shiftKey: true, target: document.body }, ctx),
    ).toBe("redo");
    // Case-insensitive (Caps Lock, some keyboard layouts).
    expect(matchShortcut({ key: "Z", ctrlKey: true, target: document.body }, ctx)).toBe("undo");
  });

  it("ignores other keys, modifiers, repeats and dragging", () => {
    expect(matchShortcut({ key: "z", target: document.body }, ctx)).toBeNull();
    expect(matchShortcut({ key: "a", ctrlKey: true, target: document.body }, ctx)).toBeNull();
    expect(
      matchShortcut({ key: "z", ctrlKey: true, metaKey: true, target: document.body }, ctx),
    ).toBeNull();
    expect(
      matchShortcut({ key: "z", ctrlKey: true, altKey: true, target: document.body }, ctx),
    ).toBeNull();
    expect(
      matchShortcut({ key: "z", ctrlKey: true, repeat: true, target: document.body }, ctx),
    ).toBeNull();
    expect(
      matchShortcut({ key: "z", ctrlKey: true, target: document.body }, { dragging: true }),
    ).toBeNull();
  });

  it("does not fire while focus is in an input field (spec: native browser behaviour there)", () => {
    for (const html of ['<input type="text">', "<textarea></textarea>", "<select></select>"]) {
      const target = el(html);
      expect(matchShortcut({ key: "z", ctrlKey: true, target }, ctx)).toBeNull();
    }
    const editable = el('<div contenteditable="true"><span>x</span></div>');
    expect(
      matchShortcut({ key: "z", ctrlKey: true, target: editable.firstElementChild }, ctx),
    ).toBeNull();
  });
});
