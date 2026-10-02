"""Helpers for reading back a WebGL canvas in the browser."""

from typing import Any

from playwright.sync_api import Page

# Draws the (WebGL) canvas into a 2D canvas and returns pixel statistics.
_READ = """
(selector) => {
  const src = document.querySelector(selector);
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let r = 0, g = 0, b = 0, pure = {red: 0, blue: 0}, hash = 2166136261;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]; g += d[i + 1]; b += d[i + 2];
    if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 0) pure.red++;
    if (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 255) pure.blue++;
    hash = Math.imul(hash ^ d[i] ^ (d[i + 1] << 8) ^ (d[i + 2] << 16), 16777619) >>> 0;
  }
  const n = d.length / 4;
  return {w: c.width, h: c.height, n, mean: [r / n, g / n, b / n], pure, hash};
}
"""


def canvas_stats(page: Page, selector: str) -> dict[str, Any]:
    return page.evaluate(_READ, selector)  # type: ignore[no-any-return]


def pixel(page: Page, selector: str, x: float, y: float) -> list[int]:
    """RGB at a relative position (0..1, origin top left)."""
    return page.evaluate(  # type: ignore[no-any-return]
        """([sel, x, y]) => {
          const src = document.querySelector(sel);
          const c = document.createElement('canvas');
          c.width = src.width; c.height = src.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(src, 0, 0);
          const px = ctx.getImageData(
            Math.floor(x * (c.width - 1)), Math.floor(y * (c.height - 1)), 1, 1
          ).data;
          return [px[0], px[1], px[2]];
        }""",
        [selector, x, y],
    )


def distinct_in_row(page: Page, selector: str, y: float) -> int:
    """Number of colour runs along a row (relative y, origin at the top)."""
    return page.evaluate(  # type: ignore[no-any-return]
        """([sel, y]) => {
          const src = document.querySelector(sel);
          const c = document.createElement('canvas');
          c.width = src.width; c.height = src.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(src, 0, 0);
          const d = ctx.getImageData(0, Math.floor(y * (c.height - 1)), c.width, 1).data;
          let runs = 1;
          for (let i = 4; i < d.length; i += 4) {
            if (d[i] !== d[i - 4] || d[i + 1] !== d[i - 3] || d[i + 2] !== d[i - 2]) runs++;
          }
          return runs;
        }""",
        [selector, y],
    )
