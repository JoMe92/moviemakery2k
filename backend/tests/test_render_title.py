"""Backend title/credits render building blocks (TASK-RENDER-008, design.md
D1-D3 of add-titles-and-credits): same font file, same alpha-blend and
vertex-transform mechanism as the web renderer
(`apps/web/src/render/{titleText,Renderer,titlePhase}.ts`). The GL tests
produce the same three frames as the corresponding web tests (freestanding
title, overlay, a position/zoom mid-state), checked by pixel comparison or
tolerance band, like the existing golden-frame tests.
"""

from collections.abc import Callable, Iterator
from pathlib import Path

import moderngl
import pytest
from conftest import requires_gl
from PIL import Image

from mmy_backend.config import DEFAULT_FONTS_DIR, DEFAULT_SHADERS_DIR, TITLE_FONT_FILE
from mmy_backend.render.frames import FrameRenderer, flip_rows
from mmy_backend.render.shaders import ShaderError, ShaderLibrary, ShaderSources
from mmy_backend.render.text import rasterize_credits, rasterize_title, wrap_line
from mmy_backend.render.title_phase import (
    PhaseDurations,
    PhaseKeyframes,
    TitlePhases,
    Transform,
    Translate,
    static_phases,
    title_transform_at,
)

W, H = 640, 480
FONT_FILE = DEFAULT_FONTS_DIR / TITLE_FONT_FILE
WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)
RED = (255, 0, 0, 255)


def solid(color: tuple[int, int, int, int], size: tuple[int, int] = (W, H)) -> Image.Image:
    return Image.new("RGBA", size, color)


def at(data: bytes, x: int, y: int, width: int = W) -> tuple[int, ...]:
    """Pixel (x, y), origin top left."""
    i = (y * width + x) * 4
    return tuple(data[i : i + 4])


# --- Pure Python (no GL): text rasterisation, like titleText.test.ts -----------


def fixed_width_measurer(char_width: float = 10.0) -> Callable[[str], float]:
    return lambda text: len(text) * char_width


def test_wrap_line_keeps_a_short_line_on_one_row() -> None:
    assert wrap_line(fixed_width_measurer(), "Hallo Welt", 1000) == ["Hallo Welt"]


def test_wrap_line_breaks_between_words_once_max_width_is_exceeded() -> None:
    # "Hallo Welt" = 100px, "Hallo Welt schoen" = 170px.
    assert wrap_line(fixed_width_measurer(), "Hallo Welt schoen", 120) == [
        "Hallo Welt",
        "schoen",
    ]


def test_wrap_line_never_splits_inside_a_single_word() -> None:
    assert wrap_line(fixed_width_measurer(), "Donaudampfschifffahrt kurz", 50) == [
        "Donaudampfschifffahrt",
        "kurz",
    ]


def test_wrap_line_collapses_whitespace_and_trims() -> None:
    assert wrap_line(fixed_width_measurer(), "  Hallo   Welt  ", 1000) == ["Hallo Welt"]


def test_wrap_line_returns_one_empty_row_for_an_empty_line() -> None:
    assert wrap_line(fixed_width_measurer(), "", 1000) == [""]


def test_rasterize_title_opaque_background_fills_every_pixel() -> None:
    image = rasterize_title(
        ["Hallo"],
        width=200,
        height=100,
        font_file=FONT_FILE,
        font_px=24,
        color=(255, 255, 255, 255),
        opaque_background=True,
    )
    assert image.mode == "RGBA"
    assert image.size == (200, 100)
    assert image.getpixel((0, 0)) == (0, 0, 0, 255)  # black background, not text
    assert image.getpixel((199, 99)) == (0, 0, 0, 255)


def test_rasterize_title_overlay_background_stays_transparent() -> None:
    image = rasterize_title(
        ["Hallo"],
        width=200,
        height=100,
        font_file=FONT_FILE,
        font_px=24,
        color=(255, 255, 255, 255),
        opaque_background=False,
    )
    assert image.getpixel((0, 0)) == (0, 0, 0, 0)
    assert image.getpixel((199, 99)) == (0, 0, 0, 0)


def test_rasterize_credits_grows_with_more_entries() -> None:
    few = rasterize_credits(["A"], width=200, font_file=FONT_FILE, font_px=20, color=WHITE)
    many = rasterize_credits(
        [f"Entry {i}" for i in range(20)], width=200, font_file=FONT_FILE, font_px=20, color=WHITE
    )
    assert few.size[0] == many.size[0] == 200
    assert many.size[1] > few.size[1]
    assert few.mode == "RGBA"
    pixel = few.getpixel((0, 0))
    assert isinstance(pixel, tuple)
    assert pixel[3] == 0  # always transparent background


# --- Pure Python: phase interpolation, 1:1 like titlePhase.test.ts -------------


def test_title_transform_at_holds_identity_for_a_static_style() -> None:
    durations = PhaseDurations(entrance_seconds=1, exit_seconds=1, total_seconds=5)
    phases = static_phases()
    identity = Transform(translate=Translate(0.0, 0.0), scale=1.0)
    assert title_transform_at(phases, durations, 0) == identity
    assert title_transform_at(phases, durations, 2.5) == identity
    assert title_transform_at(phases, durations, 5) == identity


def test_title_transform_at_interpolates_a_fly_in_entrance() -> None:
    durations = PhaseDurations(entrance_seconds=1, exit_seconds=1, total_seconds=5)
    hold = static_phases()
    phases = TitlePhases(
        entrance=PhaseKeyframes(
            start=Transform(Translate(-1.0, 0.0), 1.0),
            end=Transform(Translate(0.0, 0.0), 1.0),
        ),
        main=hold.main,
        exit=hold.exit,
    )
    assert title_transform_at(phases, durations, 0).translate.x == pytest.approx(-1.0)
    assert title_transform_at(phases, durations, 0.5).translate.x == pytest.approx(-0.5)
    assert title_transform_at(phases, durations, 1).translate.x == pytest.approx(0.0)
    assert title_transform_at(phases, durations, 3).translate.x == pytest.approx(0.0)


def test_title_transform_at_clamps_outside_total_seconds() -> None:
    durations = PhaseDurations(entrance_seconds=1, exit_seconds=1, total_seconds=5)
    phases = static_phases()
    assert title_transform_at(phases, durations, -3) == title_transform_at(phases, durations, 0)
    assert title_transform_at(phases, durations, 50) == title_transform_at(phases, durations, 5)


# --- GL: the same three frames as the web Renderer.test.ts "drawTitle" cases --


@pytest.fixture(scope="module")
def library(ctx: moderngl.Context) -> Iterator[ShaderLibrary]:
    lib = ShaderLibrary(ctx, ShaderSources(DEFAULT_SHADERS_DIR))
    try:
        yield lib
    finally:
        lib.release()


@pytest.fixture
def renderer(ctx: moderngl.Context, library: ShaderLibrary) -> Iterator[FrameRenderer]:
    # No slide media is loaded through this fixture: title tests draw PIL
    # images directly via draw_title/render_title_*.
    with FrameRenderer(ctx, library, W, H, lambda _media_id: None) as r:
        yield r


@requires_gl
def test_freestanding_title_is_opaque_like_an_image(renderer: FrameRenderer) -> None:
    title = solid(WHITE)  # buffer-sized: background + text already baked in (design.md D1)
    data = renderer.render_title_standalone(title)
    assert len(data) == W * H * 4
    for x, y in ((0, 0), (W - 1, 0), (W // 2, H // 2), (0, H - 1), (W - 1, H - 1)):
        assert at(data, x, y) == WHITE


@requires_gl
def test_overlay_title_blends_over_the_already_drawn_frame(renderer: FrameRenderer) -> None:
    base = solid(RED, (64, 48))  # 4:3, letterboxes to the full frame without bars
    title = solid((0, 0, 255, 128))  # buffer-sized, half-transparent blue
    data = renderer.render_title_overlay(base, title)
    for x, y in ((0, 0), (W // 2, H // 2), (W - 1, H - 1)):
        r, g, b, _a = at(data, x, y)
        # SRC_ALPHA/ONE_MINUS_SRC_ALPHA over opaque red (design.md D2); the
        # output alpha itself is not a product invariant - export drops it
        # when transcoding rgba -> yuv420p (encode.py).
        assert abs(r - 127) <= 2
        assert g == 0
        assert abs(b - 128) <= 2


@requires_gl
def test_blend_state_is_restored_after_an_overlay_draw(renderer: FrameRenderer) -> None:
    base = solid(RED, (64, 48))
    renderer.render_title_overlay(base, solid((0, 0, 255, 128)))
    # A later opaque draw must fully replace the frame, not mix with the red/blue
    # overlay still sitting in the framebuffer - proves gl.BLEND was disabled again.
    renderer._fbo.use()
    renderer.draw_title(solid(WHITE), blend=False)
    data = flip_rows(renderer._fbo.read(components=4, alignment=1), W, H)
    assert at(data, W // 2, H // 2) == WHITE


@requires_gl
def test_position_zoom_mid_state_matches_the_interpolated_transform(
    renderer: FrameRenderer,
) -> None:
    # Fly-In entrance, exactly like titlePhase.test.ts: start x=-1, end x=0, scale 1.
    durations = PhaseDurations(entrance_seconds=1, exit_seconds=1, total_seconds=5)
    hold = static_phases()
    phases = TitlePhases(
        entrance=PhaseKeyframes(
            start=Transform(Translate(-1.0, 0.0), 1.0),
            end=Transform(Translate(0.0, 0.0), 1.0),
        ),
        main=hold.main,
        exit=hold.exit,
    )
    mid = title_transform_at(phases, durations, 0.5)
    assert mid.translate.x == pytest.approx(-0.5)

    title = solid(WHITE)
    data = renderer.render_title_standalone(
        title, translate=(mid.translate.x, mid.translate.y), scale=mid.scale
    )
    # scale=1, translate.x=-0.5: visible footprint is ndc_x in [-1.5, 0.5] clipped
    # to [-1, 0.5], i.e. pixel x in [0, 480). Left of that stays the black clear.
    assert at(data, 400, H // 2) == WHITE
    assert at(data, 600, H // 2) == BLACK


@requires_gl
def test_title_shader_error_when_missing(ctx: moderngl.Context, tmp_path: Path) -> None:
    empty_lib = ShaderLibrary(ctx, ShaderSources(tmp_path))
    try:
        with pytest.raises(ShaderError):
            empty_lib.title_program()
    finally:
        empty_lib.release()
