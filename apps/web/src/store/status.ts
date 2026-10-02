import type { BackendState, SaveState } from "./appStore";

export function describeBackend(backend: BackendState): string {
  switch (backend.kind) {
    case "unknown":
      return "Verbinde mit Backend…";
    case "offline":
      return "Backend nicht erreichbar";
    case "ok":
      return backend.health.ffmpeg
        ? `Backend bereit · FFmpeg ${backend.health.ffmpeg}`
        : "Backend bereit · FFmpeg fehlt";
  }
}

/** Spec app-shell „Statusleiste“: Gespeichert / Wird gespeichert… / Speichern fehlgeschlagen. */
export function describeSave(state: SaveState): string | null {
  switch (state) {
    case "idle":
      return null;
    case "saving":
      return "Wird gespeichert…";
    case "saved":
      return "Gespeichert";
    case "error":
      return "Speichern fehlgeschlagen";
  }
}
