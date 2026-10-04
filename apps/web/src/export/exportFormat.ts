/**
 * Pure helpers of the "Save Movie" wizard (design.md D6): file name check,
 * size estimate, percentage and remaining time. Texts come from
 * the message catalogs; file name errors use the backend's error codes.
 */
import { formatNumber } from "../i18n/format";
import type { Locale } from "../i18n/locale";
import { translate } from "../i18n/t";
import type { ApiErrorInfo, ExportProfile } from "../lib/apiClient";

export const FILE_EXTENSION = ".mp4";
/** As in the backend (`normalize_file_name`). */
export const MAX_FILE_NAME_LENGTH = 120;
export const FORBIDDEN_CHARS = '/\\:*?"<>|';

export interface ProfileOption {
  value: ExportProfile;
  /** Measured average total bit rate in bit/s (video + silent audio track). */
  bitrate: number;
}

export const PROFILES: readonly ProfileOption[] = [
  { value: "high", bitrate: 600_000 },
  { value: "small", bitrate: 320_000 },
  // Not yet measured via `pixi run bench-export` (320x240 needs re-benchmarking);
  // estimated from the measured `high`/`small` rates via the power law observed
  // between them (bitrate shrinks slower than the pixel area as resolution drops).
  { value: "email_web", bitrate: 110_000 },
];

/** On failure, `error` carries the same code and params the backend would report. */
export type FileNameCheck = { ok: true; name: string } | { ok: false; error: ApiErrorInfo };

const fail = (code: string, params: Record<string, string | number> = {}): FileNameCheck => ({
  ok: false,
  error: { code, params, message: "" },
});

/**
 * Checks the file name like the backend: surrounding whitespace and a trailing
 * `.mp4` extension are removed; empty names, `/ \ : * ? " < > |`,
 * control characters and names that are too long are rejected.
 */
export function checkFileName(raw: string): FileNameCheck {
  let name = raw.trim();
  if (name.toLowerCase().endsWith(FILE_EXTENSION)) {
    name = name.slice(0, -FILE_EXTENSION.length).trimEnd();
  }
  if (!name) return fail("export.fileName.empty");
  const forbidden = [...new Set([...name].filter((ch) => FORBIDDEN_CHARS.includes(ch)))];
  if (forbidden.length > 0) {
    return fail("export.fileName.invalidChars", { chars: forbidden.join(" ") });
  }
  // The backend also rejects control and format characters (Unicode Cc/Cf).
  if (/[\p{Cc}\p{Cf}]/u.test(name)) {
    return fail("export.fileName.controlChars");
  }
  if (name === "." || name === "..") return fail("export.fileName.invalid");
  if (name.length > MAX_FILE_NAME_LENGTH) {
    return fail("export.fileName.tooLong", { max: MAX_FILE_NAME_LENGTH });
  }
  return { ok: true, name };
}

/** Estimated file size in bytes from duration (seconds) and profile. */
export function estimateBytes(duration: number, profile: ExportProfile): number {
  const option = PROFILES.find((p) => p.value === profile) ?? PROFILES[0];
  return (Math.max(0, duration) * (option?.bitrate ?? 0)) / 8;
}

/** "ca. 3,4 MB" / "approx. 3.4 MB", below 1 MB "ca. 850 KB" (decimal units). */
export function formatSize(bytes: number, locale: Locale): string {
  if (bytes < 1_000_000) {
    const kb = formatNumber(locale, Math.max(1, Math.round(bytes / 1000)), 0);
    return translate(locale, "units.kilobytes", { value: kb });
  }
  return translate(locale, "units.megabytes", {
    value: formatNumber(locale, bytes / 1_000_000, 1),
  });
}

/** Whole percent 0…100 (rounded down so 100 % only appears at the end). */
export function percent(progress: number): number {
  return Math.min(100, Math.max(0, Math.floor(progress * 100)));
}

/** From this progress and run time on, the remaining-time estimate is usable. */
const MIN_PROGRESS = 0.02;
const MIN_ELAPSED_MS = 1000;

/** Estimated remaining time in seconds, or null while there is too little data. */
export function estimateRemaining(elapsedMs: number, progress: number): number | null {
  if (progress < MIN_PROGRESS || elapsedMs < MIN_ELAPSED_MS || progress >= 1) return null;
  return ((elapsedMs / 1000) * (1 - progress)) / progress;
}

/** "ca. 45 Sek." / "approx. 45 sec", "ca. 2 Min. 5 Sek." or "calculating…". */
export function formatRemaining(seconds: number | null, locale: Locale): string {
  if (seconds === null) return translate(locale, "export.remainingCalculating");
  const total = Math.max(1, Math.ceil(seconds));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min === 0) return translate(locale, "export.remainingSeconds", { sec });
  return sec === 0
    ? translate(locale, "export.remainingMinutes", { min })
    : translate(locale, "export.remainingMinutesSeconds", { min, sec });
}
