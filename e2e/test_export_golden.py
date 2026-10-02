"""Kreuzvergleich Vorschau ↔ Export bei `progress` 0,5 (TASK-WEB-014, design.md D7).

Für jeden der sechs Katalogübergänge wird dasselbe Bild zweimal erzeugt:

- im Browser über den Testhook `?debug-progress=<id>:0.5` (WebGL2/SwiftShader,
  einfarbig Rot → Blau auf 640×480, wie `test_golden_frames.py`);
- im Backend direkt aus pytest mit dem Export-Renderer (`FrameRenderer`,
  EGL/llvmpipe) mit denselben einfarbigen 640×480-Eingaben.

Spec movie-export „Export entspricht der Vorschau“: Abweichung je Farbkanal
höchstens 2 bei mindestens 99,5 % der Pixel. Beide Bilder liegen oberste Zeile
zuerst vor. Bei einem Fehlschlag landen beide PNGs und ein Differenzbild im
tmp-Verzeichnis des Tests.
"""

import base64
import io
import sys
from collections.abc import Iterator
from pathlib import Path

import moderngl
import pytest
from mmy_backend.catalog import TransitionCatalog, load_catalog
from mmy_backend.config import DEFAULT_SHADERS_DIR, REPO_ROOT
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
from PIL import Image, ImageChops
from playwright.sync_api import Page

pytestmark = pytest.mark.skipif(
    not sys.platform.startswith("linux"),
    reason="Headless-Export (EGL/llvmpipe) wird offiziell nur unter Linux unterstützt",
)

CATALOG: TransitionCatalog = load_catalog(REPO_ROOT / "packages" / "catalog" / "transitions.json")
IDS = [t.id for t in CATALOG.transitions]
W, H = 640, 480  # Größe des Debug-Canvas (apps/web/src/render/DebugView.tsx)
PROGRESS = 0.5
MAX_CHANNEL_DELTA = 2
MIN_MATCH_RATIO = 0.995

# Liest das Debug-Canvas verlustfrei als PNG (oberste Zeile zuerst).
_READ_PNG = """
(selector) => {
  const src = document.querySelector(selector);
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c.toDataURL('image/png');
}
"""


def browser_frame(page: Page, base: str, transition_id: str) -> Image.Image:
    page.goto(f"{base}/?debug-progress={transition_id}:{PROGRESS}")
    page.wait_for_selector("body[data-debug-ready='1']", timeout=15_000)
    url: str = page.evaluate(_READ_PNG, "#mmy-debug-canvas")
    data = base64.b64decode(url.split(",", 1)[1])
    return Image.open(io.BytesIO(data)).convert("RGB")


@pytest.fixture(scope="module")
def renderer() -> Iterator[FrameRenderer]:
    ctx: moderngl.Context = create_render_context()
    library = ShaderLibrary(ctx, ShaderSources(DEFAULT_SHADERS_DIR))
    images = {
        "red": Image.new("RGB", (W, H), (255, 0, 0)),
        "blue": Image.new("RGB", (W, H), (0, 0, 255)),
    }
    try:
        with FrameRenderer(ctx, library, W, H, images.get) as frame_renderer:
            yield frame_renderer
    finally:
        library.release()
        ctx.release()


def timeline_for(transition_id: str) -> Timeline:
    return build_timeline(
        [
            TimelineSlide(id="a", media_id="red", duration=5.0, transition_in=None),
            TimelineSlide(
                id="b",
                media_id="blue",
                duration=5.0,
                transition_in=TransitionIn(transition_id, 1.25),
            ),
        ]
    )


def backend_frame(renderer: FrameRenderer, transition_id: str) -> Image.Image:
    frame = TransitionFrame(0, 1, transition_id, PROGRESS)
    data = renderer.render(frame, timeline_for(transition_id), CATALOG)
    return Image.frombytes("RGBA", (W, H), data).convert("RGB")


def match_ratio(a: Image.Image, b: Image.Image) -> tuple[float, int, Image.Image]:
    """Anteil der Pixel mit |Δ| ≤ MAX_CHANNEL_DELTA in jedem Kanal, max. |Δ|, Differenzbild."""
    diff = ImageChops.difference(a, b)
    r, g, b_ = diff.split()
    # Pixel liegt in der Toleranz, wenn das Maximum über die Kanäle ≤ Δ ist.
    worst = ImageChops.lighter(ImageChops.lighter(r, g), b_)
    histogram = worst.histogram()
    within = sum(histogram[: MAX_CHANNEL_DELTA + 1])
    max_delta = max(i for i, n in enumerate(histogram) if n)
    return within / (a.width * a.height), max_delta, diff


@pytest.mark.parametrize("transition_id", IDS)
def test_export_frame_matches_preview_at_half_progress(
    page: Page, server: str, renderer: FrameRenderer, transition_id: str, tmp_path: Path
) -> None:
    preview = browser_frame(page, server, transition_id)
    export = backend_frame(renderer, transition_id)
    assert preview.size == export.size == (W, H)
    if transition_id != "pixelate":  # Pixelate zeigt auf einfarbigen Bildern keine Mitte
        # Plausibilität: echtes Zwischenbild, nicht durchgehend Rot, Blau oder Schwarz.
        colors = {c for _, c in export.getcolors(W * H) or []}
        assert colors not in ({(255, 0, 0)}, {(0, 0, 255)}, {(0, 0, 0)}), (
            f"{transition_id}: {colors}"
        )

    ratio, max_delta, diff = match_ratio(preview, export)
    print(
        f"{transition_id}: {ratio * 100:.3f} % der Pixel mit |Δ| ≤ {MAX_CHANNEL_DELTA}, "
        f"max |Δ| = {max_delta}"
    )
    if ratio < MIN_MATCH_RATIO:
        preview.save(tmp_path / f"{transition_id}-preview.png")
        export.save(tmp_path / f"{transition_id}-export.png")
        # Differenz verstärkt, damit kleine Abweichungen sichtbar werden.
        diff.point(lambda v: min(255, v * 16)).save(tmp_path / f"{transition_id}-diff.png")
    assert ratio >= MIN_MATCH_RATIO, (
        f"{transition_id}: nur {ratio * 100:.3f} % der Pixel innerhalb ±{MAX_CHANNEL_DELTA} "
        f"(gefordert {MIN_MATCH_RATIO * 100:.1f} %), max |Δ| = {max_delta}; Bilder in {tmp_path}"
    )
