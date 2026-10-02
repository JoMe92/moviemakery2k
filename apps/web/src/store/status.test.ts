import { describe, expect, it } from "vitest";
import { translator } from "../i18n/t";
import { describeBackend, describeSave } from "./status";

const t = translator("de");
const en = translator("en");

describe("Statusleiste", () => {
  it("beschreibt den Backend-Zustand", () => {
    expect(describeBackend({ kind: "offline" }, t)).toBe("Backend nicht erreichbar");
    expect(describeBackend({ kind: "ok", health: { status: "ok", ffmpeg: "9.0.2" } }, t)).toBe(
      "Backend bereit · FFmpeg 9.0.2",
    );
    expect(describeBackend({ kind: "ok", health: { status: "ok", ffmpeg: null } }, t)).toBe(
      "Backend bereit · FFmpeg fehlt",
    );
  });

  it("beschreibt den Speicherstatus", () => {
    expect(describeSave("saving", t)).toBe("Wird gespeichert…");
    expect(describeSave("saved", t)).toBe("Gespeichert");
    expect(describeSave("error", t)).toBe("Speichern fehlgeschlagen");
    expect(describeSave("idle", t)).toBeNull();
  });

  it("beschreibt den Zustand auch auf Englisch", () => {
    expect(describeBackend({ kind: "offline" }, en)).toBe("Backend not reachable");
    expect(describeSave("saved", en)).toBe("Saved");
  });
});
