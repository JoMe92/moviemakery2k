/**
 * Canvas2D text rasterisation for titles and credits (design.md D1 of
 * `add-titles-and-credits`): `fillText` with the bundled "Liberation Sans"
 * font (`@mmy/fonts`, open-licensed, for pixel parity with the backend
 * export) on an alpha-preserving canvas — unlike `Renderer`'s
 * `letterbox()`, which always draws opaque on black.
 *
 * - A freestanding title element paints its black background into the same
 *   canvas before the text (design.md D1): the result is then a normal,
 *   fully opaque image source like any picture.
 * - An overlay title leaves the background transparent; `Renderer.drawTitle`
 *   composites it with alpha blending (design.md D2).
 * - Credits ("Nachspann") scale the canvas to the actual content height
 *   instead of a fixed buffer size (design.md D3), since a long list can
 *   exceed the frame height before the scroll animation moves it through.
 */
import fontUrl from "../../../../packages/fonts/LiberationSans-Regular.ttf?url";

export const TITLE_FONT_FAMILY = "MMY Title";

let fontPromise: Promise<void> | null = null;

/** Loads and registers the bundled title font; safe to call repeatedly. */
export function loadTitleFont(): Promise<void> {
  if (!fontPromise) {
    fontPromise =
      typeof FontFace === "undefined" || typeof document === "undefined"
        ? Promise.resolve()
        : new FontFace(TITLE_FONT_FAMILY, `url(${fontUrl})`).load().then((face) => {
            document.fonts.add(face);
          });
  }
  return fontPromise;
}

/** Tests only: forces the next `loadTitleFont()` call to load again. */
export function resetTitleFontForTests(): void {
  fontPromise = null;
}

function titleFont(fontPx: number): string {
  return `${fontPx}px "${TITLE_FONT_FAMILY}", "Liberation Sans", Arial, sans-serif`;
}

/** Minimal text-measuring surface, so word wrap is testable without a real canvas. */
export interface TextMeasurer {
  measureText(text: string): { width: number };
}

/** Wraps `line` at `maxWidth`, breaking between words only (design.md D1). */
export function wrapLine(measurer: TextMeasurer, line: string, maxWidth: number): string[] {
  const words = line.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [""];
  const result: string[] = [];
  let current = words[0] as string;
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (measurer.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      result.push(current);
      current = word;
    }
  }
  result.push(current);
  return result;
}

function get2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { alpha: true }) as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Canvas2D ist nicht verfügbar.");
  return ctx;
}

export interface TitleRasterOptions {
  readonly width: number;
  readonly height: number;
  readonly fontPx: number;
  readonly color: string;
  /** Standalone title (opaque, black): true. Overlay title (transparent): false. */
  readonly opaqueBackground: boolean;
  readonly align?: "center" | "left";
  /** Multiple of `fontPx`; default 1.2. */
  readonly lineHeight?: number;
}

/** Rasterises `lines` onto a fixed-size canvas, wrapped and centred (design.md D1). */
export function rasterizeTitle(
  lines: readonly string[],
  options: TitleRasterOptions,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(options.width));
  canvas.height = Math.max(1, Math.round(options.height));
  const ctx = get2DContext(canvas);
  if (options.opaqueBackground) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.font = titleFont(options.fontPx);
  ctx.fillStyle = options.color;
  const align = options.align ?? "center";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";

  const maxWidth = canvas.width * 0.9;
  const wrapped = lines.flatMap((line) => wrapLine(ctx, line, maxWidth));
  const lineHeight = options.fontPx * (options.lineHeight ?? 1.2);
  const totalHeight = wrapped.length * lineHeight;
  const startY = canvas.height / 2 - totalHeight / 2 + lineHeight / 2;
  const x = align === "left" ? canvas.width * 0.05 : canvas.width / 2;
  for (const [i, text] of wrapped.entries()) {
    ctx.fillText(text, x, startY + i * lineHeight);
  }
  return canvas;
}

export interface CreditsRasterOptions {
  readonly width: number;
  readonly fontPx: number;
  readonly color: string;
  /** Multiple of `fontPx`; default 1.4 (more breathing room than a title). */
  readonly lineHeight?: number;
  readonly paddingPx?: number;
}

/**
 * Rasterises a credits list, always transparent-background, sized to the
 * actual wrapped content height rather than the frame buffer (design.md D3)
 * — the scroll phase then moves this (possibly tall) texture through the
 * frame via the vertex transform.
 */
export function rasterizeCredits(
  entries: readonly string[],
  options: CreditsRasterOptions,
): HTMLCanvasElement {
  const width = Math.max(1, Math.round(options.width));
  const font = titleFont(options.fontPx);
  const lineHeight = options.fontPx * (options.lineHeight ?? 1.4);
  const padding = options.paddingPx ?? lineHeight;

  const probe = get2DContext(document.createElement("canvas"));
  probe.font = font;
  const maxWidth = width * 0.9;
  const wrapped = entries.flatMap((entry) => wrapLine(probe, entry, maxWidth));
  const height = Math.max(1, Math.round(wrapped.length * lineHeight + padding * 2));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = get2DContext(canvas);
  ctx.font = font;
  ctx.fillStyle = options.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [i, text] of wrapped.entries()) {
    ctx.fillText(text, width / 2, padding + lineHeight / 2 + i * lineHeight);
  }
  return canvas;
}
