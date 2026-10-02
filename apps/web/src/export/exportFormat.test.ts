import { describe, expect, it } from "vitest";
import { translateError } from "../i18n/errors";
import {
  checkFileName,
  estimateBytes,
  estimateRemaining,
  formatRemaining,
  formatSize,
  percent,
} from "./exportFormat";

describe("checkFileName", () => {
  it("akzeptiert die Vorgabe und entfernt Rand-Leerraum und .mp4", () => {
    expect(checkFileName("Mein Film")).toEqual({ ok: true, name: "Mein Film" });
    expect(checkFileName("  Urlaub 2003.MP4 ")).toEqual({ ok: true, name: "Urlaub 2003" });
  });

  it("nennt die unerlaubten Zeichen", () => {
    const result = checkFileName('Urlaub/2003:"a"');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "export.fileName.invalidChars",
        params: { chars: '/ : "' },
      });
      expect(translateError(result.error, "de")).toBe(
        'Der Dateiname enthält unerlaubte Zeichen: / : " (nicht erlaubt sind / \\ : * ? " < > |).',
      );
    }
    for (const ch of '/\\:*?"<>|') expect(checkFileName(`a${ch}b`).ok).toBe(false);
  });

  it("lehnt leere, Steuerzeichen-, Punkt- und zu lange Namen ab", () => {
    const empty = checkFileName("   ");
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(translateError(empty.error, "de")).toBe("Bitte geben Sie einen Dateinamen ein.");
      expect(translateError(empty.error, "en")).toBe("Please enter a file name.");
    }
    expect(checkFileName(".mp4").ok).toBe(false);
    expect(checkFileName("a\u0007b").ok).toBe(false);
    expect(checkFileName("..").ok).toBe(false);
    expect(checkFileName("x".repeat(120)).ok).toBe(true);
    expect(checkFileName("x".repeat(121)).ok).toBe(false);
  });
});

describe("Größenschätzung", () => {
  it("rechnet aus Dauer und Profil und formatiert deutsch", () => {
    // 45 s · 0,6 Mbit/s = 3,375 MB; 45 s · 0,32 Mbit/s = 1,8 MB
    expect(formatSize(estimateBytes(45, "high"), "de")).toBe("ca. 3,4 MB");
    expect(formatSize(estimateBytes(45, "small"), "de")).toBe("ca. 1,8 MB");
    expect(formatSize(estimateBytes(5, "small"), "de")).toBe("ca. 200 KB");
    expect(formatSize(estimateBytes(0, "high"), "de")).toBe("ca. 1 KB");
    expect(formatSize(estimateBytes(600, "high"), "de")).toBe("ca. 45,0 MB");
  });
});

describe("Fortschritt und Restzeit", () => {
  it("rundet Prozent ab und begrenzt sie", () => {
    expect(percent(0)).toBe(0);
    expect(percent(0.426)).toBe(42);
    expect(percent(0.999)).toBe(99);
    expect(percent(1.2)).toBe(100);
  });

  it("schätzt die Restzeit erst mit genug Daten", () => {
    expect(estimateRemaining(500, 0.5)).toBeNull();
    expect(estimateRemaining(5000, 0.01)).toBeNull();
    expect(estimateRemaining(10_000, 0.25)).toBeCloseTo(30);
    expect(formatRemaining(null, "de")).toBe("wird berechnet…");
    expect(formatRemaining(29.2, "de")).toBe("ca. 30 Sek.");
    expect(formatRemaining(0.1, "de")).toBe("ca. 1 Sek.");
    expect(formatRemaining(125, "de")).toBe("ca. 2 Min. 5 Sek.");
    expect(formatRemaining(120, "de")).toBe("ca. 2 Min.");
  });
});

describe("Formate auf Englisch", () => {
  it("formatiert Größe und Restzeit englisch", () => {
    expect(formatSize(estimateBytes(45, "high"), "en")).toBe("approx. 3.4 MB");
    expect(formatSize(estimateBytes(5, "small"), "en")).toBe("approx. 200 KB");
    expect(formatRemaining(null, "en")).toBe("calculating…");
    expect(formatRemaining(29.2, "en")).toBe("approx. 30 sec");
    expect(formatRemaining(125, "en")).toBe("approx. 2 min 5 sec");
    expect(formatRemaining(120, "en")).toBe("approx. 2 min");
  });
});
