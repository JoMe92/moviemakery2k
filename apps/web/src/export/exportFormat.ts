/**
 * Reine Hilfsfunktionen des Assistenten „Film speichern“ (design.md D6):
 * Dateinamenprüfung, Größenschätzung, Prozent und Restzeit.
 */
import type { ExportProfile } from "../lib/apiClient";

export const DEFAULT_FILE_NAME = "Mein Film";
export const FILE_EXTENSION = ".mp4";
/** Wie im Backend (`normalize_file_name`). */
export const MAX_FILE_NAME_LENGTH = 120;
export const FORBIDDEN_CHARS = '/\\:*?"<>|';

export interface ProfileOption {
  value: ExportProfile;
  label: string;
  /** Gemessene mittlere Gesamtbitrate in Bit/s (Video + stumme Tonspur). */
  bitrate: number;
}

export const PROFILES: readonly ProfileOption[] = [
  { value: "high", label: "Hohe Qualität (960×720)", bitrate: 600_000 },
  { value: "small", label: "Kleine Datei (640×480)", bitrate: 320_000 },
];

export type FileNameCheck = { ok: true; name: string } | { ok: false; message: string };

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
  if (!name) return { ok: false, message: "Bitte geben Sie einen Dateinamen ein." };
  const forbidden = [...new Set([...name].filter((ch) => FORBIDDEN_CHARS.includes(ch)))];
  if (forbidden.length > 0) {
    return {
      ok: false,
      message: `Der Dateiname enthält unerlaubte Zeichen: ${forbidden.join(" ")} (nicht erlaubt sind ${[...FORBIDDEN_CHARS].join(" ")}).`,
    };
  }
  // Steuer- und Formatzeichen (Unicode Cc/Cf) lehnt auch das Backend ab.
  if (/[\p{Cc}\p{Cf}]/u.test(name)) {
    return { ok: false, message: "Der Dateiname enthält Steuerzeichen." };
  }
  if (name === "." || name === "..") return { ok: false, message: "Der Dateiname ist ungültig." };
  if (name.length > MAX_FILE_NAME_LENGTH) {
    return {
      ok: false,
      message: `Der Dateiname ist zu lang (höchstens ${MAX_FILE_NAME_LENGTH} Zeichen).`,
    };
  }
  return { ok: true, name };
}

/** Geschätzte Dateigröße in Byte aus Dauer (Sekunden) und Profil. */
export function estimateBytes(duration: number, profile: ExportProfile): number {
  const option = PROFILES.find((p) => p.value === profile) ?? PROFILES[0];
  return (Math.max(0, duration) * (option?.bitrate ?? 0)) / 8;
}

const MB = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const KB = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

/** „ca. 3,4 MB“ bzw. unter 1 MB „ca. 850 KB“ (dezimale Einheiten). */
export function formatSize(bytes: number): string {
  if (bytes < 1_000_000) return `ca. ${KB.format(Math.max(1, Math.round(bytes / 1000)))} KB`;
  return `ca. ${MB.format(bytes / 1_000_000)} MB`;
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

/** „ca. 45 Sek.“, „ca. 2 Min. 5 Sek.“ oder „wird berechnet…“. */
export function formatRemaining(seconds: number | null): string {
  if (seconds === null) return "wird berechnet…";
  const total = Math.max(1, Math.ceil(seconds));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (min === 0) return `ca. ${sec} Sek.`;
  return sec === 0 ? `ca. ${min} Min.` : `ca. ${min} Min. ${sec} Sek.`;
}
