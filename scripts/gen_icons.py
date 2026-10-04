"""Icons of the installable app (add-mobile-delivery design.md D5).

    python scripts/gen_icons.py

Invoked via the Pixi task `gen-icons`. Own design, no Microsoft elements: a film
strip with three coloured frames on a glossy Luna-blue tile. One list of shapes
(`SHAPES`) is written both as SVG (`icon.svg`) and, with Pillow, as PNGs in the
sizes the manifest names; no extra dependency for SVG rendering. The output
under apps/web/public/icons/ is committed.
"""

import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "apps" / "web" / "public" / "icons"

SUPERSAMPLE = 4
"""Drawn at this multiple and scaled down: Pillow draws without anti-aliasing."""

# Colours from apps/web/src/styles/theme.css (Luna title bar, window face).
BLUE_TOP = "#4a8cf7"
BLUE_BOTTOM = "#0b3fae"
FACE = "#ece9d8"
FILM = "#1e1e24"
FRAMES = ("#f8b33a", "#6fbf4a", "#7ba2e7")
GLOSS = (255, 255, 255, 64)

TILE_RADIUS = 0.18
"""Corner radius of the `any` icons, relative to the size."""
MASKABLE_SCALE = 0.72
"""Maskable icons keep the motif inside the safe zone (a centred circle of 80 %)."""


@dataclass(frozen=True, slots=True)
class Rect:
    """A rounded rectangle in units of the motif box (0..1)."""

    x0: float
    y0: float
    x1: float
    y1: float
    fill: str
    radius: float = 0.0


def _shapes() -> list[Rect]:
    shapes = [Rect(0.12, 0.28, 0.88, 0.72, FILM, 0.04)]
    holes = 6
    pitch = 0.76 / holes
    for i in range(holes):
        x = 0.12 + pitch * i + pitch * 0.28
        for y in (0.315, 0.645):
            shapes.append(Rect(x, y, x + pitch * 0.44, y + 0.04, FACE, 0.008))
    width = 0.76 / len(FRAMES)
    for i, colour in enumerate(FRAMES):
        x = 0.12 + width * i + 0.025
        shapes.append(Rect(x, 0.395, x + width - 0.05, 0.605, colour, 0.015))
    return shapes


SHAPES = _shapes()


@dataclass(frozen=True, slots=True)
class Variant:
    file: str
    size: int
    maskable: bool = False
    """Full-bleed background, motif in the safe zone."""
    rounded: bool = True
    """Rounded tile with transparent corners (false: full square, e.g. for iOS)."""


VARIANTS = (
    Variant("icon-192.png", 192),
    Variant("icon-512.png", 512),
    Variant("icon-maskable-512.png", 512, maskable=True, rounded=False),
    Variant("apple-touch-icon-180.png", 180, rounded=False),
)


def _hex(colour: str) -> tuple[int, int, int]:
    return int(colour[1:3], 16), int(colour[3:5], 16), int(colour[5:7], 16)


def _gradient(size: int) -> Image.Image:
    top, bottom = _hex(BLUE_TOP), _hex(BLUE_BOTTOM)
    image = Image.new("RGBA", (size, size))
    draw = ImageDraw.Draw(image)
    for y in range(size):
        t = y / max(size - 1, 1)
        colour = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom, strict=True))
        draw.line([(0, y), (size, y)], fill=(*colour, 255))
    return image


def render(variant: Variant) -> Image.Image:
    size = variant.size * SUPERSAMPLE
    image = _gradient(size)
    # Y2K gloss: a light ellipse over the upper half.
    gloss = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).ellipse(
        [(-0.2 * size, -0.62 * size), (1.2 * size, 0.46 * size)], fill=GLOSS
    )
    image = Image.alpha_composite(image, gloss)
    draw = ImageDraw.Draw(image)
    scale = MASKABLE_SCALE if variant.maskable else 1.0
    offset = (1 - scale) / 2 * size
    unit = scale * size
    for shape in SHAPES:
        box = [
            (offset + shape.x0 * unit, offset + shape.y0 * unit),
            (offset + shape.x1 * unit, offset + shape.y1 * unit),
        ]
        draw.rounded_rectangle(box, radius=shape.radius * unit, fill=shape.fill)
    if variant.rounded:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [(0, 0), (size - 1, size - 1)], radius=TILE_RADIUS * size, fill=255
        )
        image.putalpha(mask)
    image = image.resize((variant.size, variant.size), Image.Resampling.LANCZOS)
    return image if variant.rounded else image.convert("RGB")


def _num(value: float) -> str:
    return f"{value:.4g}"


def svg() -> str:
    """The same design as SVG on a 512 grid (`any` variant)."""
    s = 512
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}" viewBox="0 0 {s} {s}">',
        "  <title>moviemakerY2K</title>",
        "  <defs>",
        '    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">',
        f'      <stop offset="0" stop-color="{BLUE_TOP}"/>',
        f'      <stop offset="1" stop-color="{BLUE_BOTTOM}"/>',
        "    </linearGradient>",
        '    <clipPath id="clip">',
        f'      <rect width="{s}" height="{s}" rx="{_num(TILE_RADIUS * s)}"/>',
        "    </clipPath>",
        "  </defs>",
        '  <g clip-path="url(#clip)">',
        f'    <rect width="{s}" height="{s}" fill="url(#tile)"/>',
        f'    <ellipse cx="{_num(0.5 * s)}" cy="{_num(-0.08 * s)}" rx="{_num(0.7 * s)}" '
        f'ry="{_num(0.54 * s)}" fill="#ffffff" fill-opacity="{_num(GLOSS[3] / 255)}"/>',
    ]
    for shape in SHAPES:
        lines.append(
            f'    <rect x="{_num(shape.x0 * s)}" y="{_num(shape.y0 * s)}" '
            f'width="{_num((shape.x1 - shape.x0) * s)}" height="{_num((shape.y1 - shape.y0) * s)}" '
            f'rx="{_num(shape.radius * s)}" fill="{shape.fill}"/>'
        )
    lines += ["  </g>", "</svg>", ""]
    return "\n".join(lines)


def main(target: Path = ICON_DIR) -> int:
    target.mkdir(parents=True, exist_ok=True)
    (target / "icon.svg").write_text(svg(), encoding="utf-8")
    for variant in VARIANTS:
        render(variant).save(target / variant.file, optimize=True)
        print(f"{variant.file}: {variant.size}x{variant.size}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
