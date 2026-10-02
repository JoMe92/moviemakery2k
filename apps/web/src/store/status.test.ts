import { describe, expect, it } from "vitest";
import { describeBackend, describeSave } from "./status";

describe("Statusleiste", () => {
  it("beschreibt den Backend-Zustand", () => {
    expect(describeBackend({ kind: "offline" })).toBe("Backend nicht erreichbar");
    expect(describeBackend({ kind: "ok", health: { status: "ok", ffmpeg: "9.0.2" } })).toBe(
      "Backend bereit · FFmpeg 9.0.2",
    );
    expect(describeBackend({ kind: "ok", health: { status: "ok", ffmpeg: null } })).toBe(
      "Backend bereit · FFmpeg fehlt",
    );
  });

  it("beschreibt den Speicherstatus", () => {
    expect(describeSave("saving")).toBe("Wird gespeichert…");
    expect(describeSave("saved")).toBe("Gespeichert");
    expect(describeSave("error")).toBe("Speichern fehlgeschlagen");
    expect(describeSave("idle")).toBeNull();
  });
});
