/**
 * Built-in 640×480 test pattern for the debug view (design.md D10).
 *
 * Every pixel is defined by integer arithmetic only (no canvas gradients, no
 * anti-aliasing, no scaling), so the backend side of the E2E cross-check
 * (`e2e/test_export_golden_pattern.py`) reproduces it bit for bit. Keep both
 * definitions in sync.
 *
 * - variant "from": red = horizontal ramp, green = vertical ramp,
 *   blue = 40 px checkerboard (0 / 255).
 * - variant "to": red = 32 px checkerboard (32 / 224), green = falling
 *   horizontal ramp, blue = vertical ramp.
 */
export const PATTERN_WIDTH = 640;
export const PATTERN_HEIGHT = 480;

export type PatternVariant = "from" | "to";

export function patternPixel(
  variant: PatternVariant,
  x: number,
  y: number,
): [number, number, number] {
  const ramp = Math.floor((2 * x) / 5); // 0 … 255 over 640 px
  const rampY = Math.floor((8 * y) / 15); // 0 … 255 over 480 px
  if (variant === "from") {
    const checker = (Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 1;
    return [ramp, rampY, checker ? 255 : 0];
  }
  const checker = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 1;
  return [checker ? 224 : 32, 255 - ramp, rampY];
}

/** RGBA bytes of the pattern, top row first. */
export function patternRgba(variant: PatternVariant): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(PATTERN_WIDTH * PATTERN_HEIGHT * 4);
  for (let y = 0; y < PATTERN_HEIGHT; y++) {
    for (let x = 0; x < PATTERN_WIDTH; x++) {
      const [r, g, b] = patternPixel(variant, x, y);
      const i = (y * PATTERN_WIDTH + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** The pattern as a canvas, exactly 640×480 (written with putImageData, no filtering). */
export function patternCanvas(variant: PatternVariant): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = PATTERN_WIDTH;
  c.height = PATTERN_HEIGHT;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.putImageData(new ImageData(patternRgba(variant), PATTERN_WIDTH, PATTERN_HEIGHT), 0, 0);
  }
  return c;
}
