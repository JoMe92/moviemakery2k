import type { Translate } from "../i18n/t";
import type { BackendState, SaveState } from "./appStore";

export function describeBackend(backend: BackendState, t: Translate): string {
  switch (backend.kind) {
    case "unknown":
      return t("status.connecting");
    case "offline":
      return t("status.offline");
    case "ok":
      return backend.health.ffmpeg
        ? t("status.ready", { version: backend.health.ffmpeg })
        : t("status.readyNoFfmpeg");
  }
}

/** spec app-shell "Statusleiste und Backend-Zustand": saved / saving… / saving failed. */
export function describeSave(state: SaveState, t: Translate): string | null {
  switch (state) {
    case "idle":
      return null;
    case "saving":
      return t("status.saving");
    case "saved":
      return t("status.saved");
    case "error":
      return t("status.saveFailed");
  }
}
