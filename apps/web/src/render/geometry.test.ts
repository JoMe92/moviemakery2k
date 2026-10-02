import { describe, expect, it } from "vitest";
import { bufferSize, containRect } from "./geometry";

describe("containRect", () => {
  it("passt ein Hochkant-Bild mit Balken links und rechts ein", () => {
    expect(containRect(300, 600, 640, 480)).toEqual({ x: 200, y: 0, width: 240, height: 480 });
  });

  it("passt ein Breitbild mit Balken oben und unten ein", () => {
    expect(containRect(1920, 1080, 640, 480)).toEqual({ x: 0, y: 60, width: 640, height: 360 });
  });

  it("füllt bei gleichem Seitenverhältnis die ganze Fläche", () => {
    expect(containRect(1600, 1200, 640, 480)).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });

  it("vergrößert kleine Bilder und bleibt ganzzahlig und mittig", () => {
    const r = containRect(3, 7, 1280, 960);
    expect(r.height).toBe(960);
    expect(r.width).toBe(411);
    expect(Number.isInteger(r.x)).toBe(true);
    expect(r.x).toBe(Math.floor((1280 - 411) / 2));
  });

  it("liefert für leere Größen ein leeres Rechteck", () => {
    expect(containRect(0, 10, 640, 480)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("bufferSize", () => {
  it("rechnet CSS-Größe mal DPR und bleibt exakt 4:3", () => {
    expect(bufferSize(640, 480, 1)).toEqual({ width: 640, height: 480 });
    expect(bufferSize(640, 480, 2)).toEqual({ width: 1280, height: 960 });
    const odd = bufferSize(401.5, 301.1, 1.25);
    expect(odd.width * 3).toBe(odd.height * 4);
    expect(odd.width).toBeLessThanOrEqual(401.5 * 1.25);
  });

  it("nimmt bei falschem Seitenverhältnis die größte 4:3-Fläche", () => {
    expect(bufferSize(1000, 300, 1)).toEqual({ width: 400, height: 300 });
  });

  it("begrenzt auf die maximale Texturgröße und nie unter 4×3", () => {
    expect(bufferSize(10000, 7500, 2, 4096)).toEqual({ width: 4096, height: 3072 });
    expect(bufferSize(0, 0, 1)).toEqual({ width: 4, height: 3 });
  });
});
