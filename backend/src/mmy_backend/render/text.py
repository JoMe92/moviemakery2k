"""Text rasterisation for titles and credits (design.md D1 of
add-titles-and-credits), mirroring `apps/web/src/render/titleText.ts`:
Pillow `ImageDraw.text` with the bundled "Liberation Sans" font
(`packages/fonts`, same file as the web renderer, for pixel parity between
preview and export) on an RGBA image.

- A freestanding title element paints its black background first: the
  result is then a normal, fully opaque image like any picture.
- An overlay title leaves the background transparent; `FrameRenderer.draw_title`
  composites it with alpha blending (design.md D2).
- Credits ("Nachspann") scale the image to the actual content height instead
  of a fixed buffer size (design.md D3), since a long list can exceed the
  frame height before the scroll animation moves it through.
"""

from collections.abc import Callable, Sequence
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

Color = tuple[int, int, int, int]
TextMeasurer = Callable[[str], float]

TRANSPARENT: Color = (0, 0, 0, 0)
OPAQUE_BLACK: Color = (0, 0, 0, 255)


def wrap_line(measure: TextMeasurer, line: str, max_width: float) -> list[str]:
    """Wraps `line` at `max_width`, breaking between words only (design.md D1)."""
    words = [w for w in line.split() if w]
    if not words:
        return [""]
    result: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if measure(candidate) <= max_width:
            current = candidate
        else:
            result.append(current)
            current = word
    result.append(current)
    return result


def _load_font(font_file: Path, font_px: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(font_file), size=max(1, round(font_px)))


def rasterize_title(
    lines: Sequence[str],
    *,
    width: int,
    height: int,
    font_file: Path,
    font_px: float,
    color: Color,
    opaque_background: bool,
    align: str = "center",
    line_height_factor: float = 1.2,
) -> Image.Image:
    """Rasterises `lines` onto a fixed-size RGBA canvas, wrapped and centred."""
    canvas = Image.new(
        "RGBA", (max(1, width), max(1, height)), OPAQUE_BLACK if opaque_background else TRANSPARENT
    )
    draw = ImageDraw.Draw(canvas)
    font = _load_font(font_file, font_px)
    max_width = canvas.width * 0.9
    wrapped = [
        wrapped_line
        for line in lines
        for wrapped_line in wrap_line(lambda s: draw.textlength(s, font=font), line, max_width)
    ]
    line_height = font_px * line_height_factor
    total_height = len(wrapped) * line_height
    start_y = canvas.height / 2 - total_height / 2 + line_height / 2
    left = align == "left"
    x = canvas.width * 0.05 if left else canvas.width / 2
    anchor = "lm" if left else "mm"
    for i, text in enumerate(wrapped):
        draw.text((x, start_y + i * line_height), text, font=font, fill=color, anchor=anchor)
    return canvas


def rasterize_credits(
    entries: Sequence[str],
    *,
    width: int,
    font_file: Path,
    font_px: float,
    color: Color,
    line_height_factor: float = 1.4,
    padding_px: float | None = None,
) -> Image.Image:
    """Rasterises a credits list, always transparent-background, sized to the
    actual wrapped content height rather than the frame buffer (design.md D3).
    """
    canvas_width = max(1, width)
    font = _load_font(font_file, font_px)
    line_height = font_px * line_height_factor
    padding = line_height if padding_px is None else padding_px

    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    max_width = canvas_width * 0.9
    wrapped = [
        wrapped_line
        for entry in entries
        for wrapped_line in wrap_line(lambda s: probe.textlength(s, font=font), entry, max_width)
    ]
    canvas_height = max(1, round(len(wrapped) * line_height + padding * 2))

    canvas = Image.new("RGBA", (canvas_width, canvas_height), TRANSPARENT)
    draw = ImageDraw.Draw(canvas)
    for i, text in enumerate(wrapped):
        draw.text(
            (canvas_width / 2, padding + line_height / 2 + i * line_height),
            text,
            font=font,
            fill=color,
            anchor="mm",
        )
    return canvas
