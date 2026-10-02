"""Cross-check preview ↔ export with the built-in test pattern (TASK-WEB-026, design.md D10).

On solid-colour frames (`test_export_golden.py`) Pixelate and Dissolve say little:
the blocks of a single colour look the same no matter where they are sampled.
Here both frames are the exact 640x480 test pattern of the debug view
(`?debug-progress=<id>:<p>:pattern`, `apps/web/src/render/testPattern.ts`), and
pytest feeds the same pattern, rebuilt from the same integer formula, to the
export renderer (`FrameRenderer`, EGL/llvmpipe). No image is scaled on either side.

Tolerance as in spec movie-export "Export entspricht der Vorschau": a deviation
of at most 2 per colour channel for at least 99.5 % of the pixels. On failure
both PNGs and a difference image are written to the test's tmp directory.
"""

import base64
import io
import sys
from collections.abc import Iterator
from pathlib import Path

import moderngl
import pytest
from mmy_backend.config import DEFAULT_SHADERS_DIR
from mmy_backend.render.context import create_render_context
from mmy_backend.render.frames import FrameRenderer
from mmy_backend.render.shaders import ShaderLibrary, ShaderSources
from mmy_backend.render.timeline import (
    Timeline,
    TimelineSlide,
    TransitionFrame,
    TransitionIn,
    build_timeline,
)
from PIL import Image
from playwright.sync_api import Page
from test_export_golden import CATALOG, MAX_CHANNEL_DELTA, MIN_MATCH_RATIO, H, W, match_ratio

pytestmark = pytest.mark.skipif(
    not sys.platform.startswith("linux"),
    reason="Headless export (EGL/llvmpipe) is officially supported on Linux only",
)

CASES = [(t, p) for t in ("pixelate", "dissolve") for p in (0.25, 0.5, 0.75)]

# Reads the debug canvas losslessly as PNG (top row first).
_READ_PNG = """
(selector) => {
  const src = document.querySelector(selector);
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c.toDataURL('image/png');
}
"""


def pattern_pixel(variant: str, x: int, y: int) -> tuple[int, int, int]:
    """Mirror of `patternPixel` in apps/web/src/render/testPattern.ts — keep in sync."""
    ramp = (2 * x) // 5
    ramp_y = (8 * y) // 15
    if variant == "from":
        checker = (x // 40 + y // 40) % 2 == 1
        return (ramp, ramp_y, 255 if checker else 0)
    checker = (x // 32 + y // 32) % 2 == 1
    return (224 if checker else 32, 255 - ramp, ramp_y)


def pattern_image(variant: str) -> Image.Image:
    data = bytes(c for y in range(H) for x in range(W) for c in pattern_pixel(variant, x, y))
    return Image.frombytes("RGB", (W, H), data)


def preview_frame(page: Page, base: str, transition_id: str, progress: float) -> Image.Image:
    page.goto(f"{base}/?debug-progress={transition_id}:{progress}:pattern")
    page.wait_for_selector("body[data-debug-ready='1']", timeout=15_000)
    url: str = page.evaluate(_READ_PNG, "#mmy-debug-canvas")
    data = base64.b64decode(url.split(",", 1)[1])
    return Image.open(io.BytesIO(data)).convert("RGB")


@pytest.fixture(scope="module")
def patterns() -> dict[str, Image.Image]:
    return {"from": pattern_image("from"), "to": pattern_image("to")}


@pytest.fixture(scope="module")
def renderer(patterns: dict[str, Image.Image]) -> Iterator[FrameRenderer]:
    ctx: moderngl.Context = create_render_context()
    library = ShaderLibrary(ctx, ShaderSources(DEFAULT_SHADERS_DIR))
    try:
        with FrameRenderer(ctx, library, W, H, patterns.get) as frame_renderer:
            yield frame_renderer
    finally:
        library.release()
        ctx.release()


def timeline_for(transition_id: str) -> Timeline:
    return build_timeline(
        [
            TimelineSlide(id="a", media_id="from", duration=5.0, transition_in=None),
            TimelineSlide(
                id="b",
                media_id="to",
                duration=5.0,
                transition_in=TransitionIn(transition_id, 1.25),
            ),
        ]
    )


def export_frame(renderer: FrameRenderer, transition_id: str, progress: float) -> Image.Image:
    frame = TransitionFrame(0, 1, transition_id, progress)
    data = renderer.render(frame, timeline_for(transition_id), CATALOG)
    return Image.frombytes("RGBA", (W, H), data).convert("RGB")


def assert_close(a: Image.Image, b: Image.Image, label: str, tmp_path: Path) -> None:
    ratio, max_delta, diff = match_ratio(a, b)
    print(
        f"{label}: {ratio * 100:.3f} % of the pixels with |Δ| ≤ {MAX_CHANNEL_DELTA}, "
        f"max |Δ| = {max_delta}"
    )
    if ratio < MIN_MATCH_RATIO:
        a.save(tmp_path / f"{label}-a.png")
        b.save(tmp_path / f"{label}-b.png")
        # Amplify the difference so that small deviations become visible.
        diff.point(lambda v: min(255, v * 16)).save(tmp_path / f"{label}-diff.png")
    assert ratio >= MIN_MATCH_RATIO, (
        f"{label}: only {ratio * 100:.3f} % of the pixels within ±{MAX_CHANNEL_DELTA} "
        f"(required {MIN_MATCH_RATIO * 100:.1f} %), max |Δ| = {max_delta}; images in {tmp_path}"
    )


@pytest.mark.parametrize(("progress", "variant"), [(0.0, "from"), (1.0, "to")])
def test_debug_pattern_matches_backend_pattern(
    page: Page, server: str, patterns: dict[str, Image.Image], progress: float, variant: str
) -> None:
    """The browser pattern is the Python pattern: Pixelate at 0 / 1 shows the frame unchanged."""
    preview = preview_frame(page, server, "pixelate", progress)
    assert preview.size == (W, H)
    ratio, max_delta, _ = match_ratio(preview, patterns[variant])
    assert ratio == 1.0 and max_delta == 0, f"{variant}: {ratio=}, {max_delta=}"


@pytest.mark.parametrize(("transition_id", "progress"), CASES)
def test_export_frame_matches_preview_with_pattern(
    page: Page,
    server: str,
    renderer: FrameRenderer,
    patterns: dict[str, Image.Image],
    transition_id: str,
    progress: float,
    tmp_path: Path,
) -> None:
    preview = preview_frame(page, server, transition_id, progress)
    export = export_frame(renderer, transition_id, progress)
    assert preview.size == export.size == (W, H)
    # Sanity check: a real in-between frame, neither input pattern unchanged.
    for variant in ("from", "to"):
        ratio, _, _ = match_ratio(export, patterns[variant])
        assert ratio < 0.9, f"{transition_id}@{progress}: export equals the {variant!r} pattern"
    assert_close(preview, export, f"{transition_id}-{progress}", tmp_path)
