/*
 * Haptic feedback (add-mobile-layout design.md D13): short vibrations when a
 * long press triggers, an item is dropped and a drop is refused. Without the
 * Vibration API (e.g. iOS Safari) nothing happens. The switch "Vibration" in
 * Tools → Options is stored locally (default on).
 */

export const VIBRATION_STORAGE_KEY = "mmy.vibration";

export const HAPTICS = {
  activate: 10,
  drop: 15,
  reject: [10, 40, 10],
} as const satisfies Record<string, number | readonly number[]>;

export type HapticKind = keyof typeof HAPTICS;

export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function vibrationEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(VIBRATION_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setVibrationEnabled(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(VIBRATION_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage unavailable: nothing to remember.
  }
}

export function vibrate(kind: HapticKind): void {
  if (!canVibrate() || !vibrationEnabled()) return;
  const pattern = HAPTICS[kind];
  navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
}
