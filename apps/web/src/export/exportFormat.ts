/**
 * Reine Hilfsfunktionen des Assistenten „Film speichern“ (design.md D6):
 * Dateinamenprüfung, Größenschätzung, Prozent und Restzeit. Texts come from
 * the message catalogs; file name errors use the backend's error codes.
 */
import { formatNumber } from "../i18n/format";
import type { Locale } from "../i18n/locale";
import { translate } from "../i18n/t";
import type { ApiErrorInfo, ExportProfile } from "../lib/apiClient";

export const FILE_EXTENSION = ".mp4";
/** Wie im Backend (`normalize_file_name`). */
export const MAX_FILE_NAME_LENGTH = 120;
export const FORBIDDEN_CHARS = '/\\:*?"<>|';

export interface ProfileOption {
  value: ExportProfile;
  /** Gemessene mittlere Gesamtbitrate in Bit/s (Video + stumme Tonspur). */
  bitrate: number;
}

export const PROFILES: readonly ProfileOption[] = [
  { value: "high", bitrate: 600_000 },
  { value: "small", bitrate: 320_000 },
];

/** On failure, `error` carries the same code and params the backend would report. */
export type FileNameCheck = { ok: true; name: string } | { ok: false; error: ApiErrorInfo };

const fail = (code: string, params: Record<string, string | number> = {}): FileNameCheck => ({
  ok: false,
  error: { code, params, message: "" },
});

/**
 * Prüft den Dateinamen wie das Backend: Rand-Leerraum und eine angehängte
 * Endung `.mp4` werden entfernt; leere Namen, `/ \ : * ? " < > |`,
 * Steuerzeichen und zu lange Namen werden abgelehnt.
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
  // Steuer- und Formatzeichen (Unicode Cc/Cf) lehnt auch das Backend ab.
  if (/[\p{Cc}\p{Cf}]/u.test(name)) {
    return fail("export.fileName.controlChars");
  }
  if (name === "." || name === "..") return fail("export.fileName.invalid");
  if (name.length > MAX_FILE_NAME_LENGTH) {
    return fail("export.fileName.tooLong", { max: MAX_FILE_NAME_LENGTH });
  }
  return { ok: true, name };
}

/** Geschätzte Dateigröße in Byte aus Dauer (Sekunden) und Profil. */
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

/** Ganze Prozent 0…100 (abgerundet, damit 100 % erst am Ende erscheint). */
export function percent(progress: number): number {
  return Math.min(100, Math.max(0, Math.floor(progress * 100)));
}

/** Ab diesem Fortschritt und dieser Laufzeit ist die Restzeitschätzung brauchbar. */
const MIN_PROGRESS = 0.02;
const MIN_ELAPSED_MS = 1000;

/** Geschätzte Restzeit in Sekunden oder null, solange zu wenig Daten vorliegen. */
export function estimateRemaining(elapsedMs: number, progress: number): number | null {
  if (progress < MIN_PROGRESS || elapsedMs < MIN_ELAPSED_MS || progress >= 1) return null;
  return ((elapsedMs / 1000) * (1 - progress)) / progress;
}

/** "ca. 45 Sek." / "approx. 45 sec", "ca. 2 Min. 5 Sek." or "wird berechnet…". */
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
