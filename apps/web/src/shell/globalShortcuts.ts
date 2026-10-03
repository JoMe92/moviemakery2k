/**
 * Pure predicate for the application-wide keyboard shortcuts (design.md D3).
 * Does not fire while focus is in an input field (native browser behaviour
 * keeps the key there) or while a drag is in progress.
 */
import { isTypingTarget } from "../player/controls";

export type ShortcutAction = "undo" | "redo";

export interface ShortcutKeyEvent {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  target: EventTarget | null;
}

/** Which action (if any) a keydown event triggers; null when none applies. */
export function matchShortcut(
  event: ShortcutKeyEvent,
  context: { dragging: boolean },
): ShortcutAction | null {
  if (!event.ctrlKey || event.metaKey || event.altKey || event.repeat) return null;
  if (context.dragging || isTypingTarget(event.target)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}
