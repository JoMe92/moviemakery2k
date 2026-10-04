"""Golden frames of the TASK-FX-009 stylised effects (design.md D1).

Same GL-space convention as test_render_effects.py (both upload and read-back
use OpenGL's own bottom-row-first order, so expected pixels are derived
directly from each shader's maths). The deterministic-noise effects
(film-age-*, film-grain) use the exact same PCG hash as the Dissolve
transition and `effects/film-age-*.glsl`/`film-grain.glsl`; `_pcg_hash`/
`_noise_for` below port that hash bit-for-bit (masked to 32 bits at every
step, matching GLSL's `uint` wraparound) so the expected values are computed
independently of the shader, not copied from its output.
"""

from collections.abc import Iterator

import moderngl
import pytest
from conftest import requires_gl

from mmy_backend.config import DEFAULT_SHADERS_DIR
from mmy_backend.render.effects import IMAGE_TEXTURE_UNIT, EffectLibrary, EffectSources

_MASK32 = 0xFFFFFFFF


def _pcg_hash(v: int) -> int:
    v &= _MASK32
    state = (v * 747796405 + 2891336453) & _MASK32
    word = (((state >> ((state >> 28) + 4)) ^ state) * 277803737) & _MASK32
    return ((word >> 22) ^ word) & _MASK32


def _noise_for(x: int, y: int, amount: float) -> float:
    h = _pcg_hash(x ^ _pcg_hash(y))
    frac = (h & 0x00FFFFFF) / 16777216.0
    return (frac - 0.5) * 2.0 * amount


def _to_u8(value: float) -> int:
    return round(max(0.0, min(1.0, value)) * 255)


@pytest.fixture
def sources() -> EffectSources:
    return EffectSources(DEFAULT_SHADERS_DIR)


@pytest.fixture
def library(ctx: moderngl.Context, sources: EffectSources) -> Iterator[EffectLibrary]:
    lib = EffectLibrary(ctx, sources)
    try:
        yield lib
    finally:
        lib.release()


def _draw(
    library: EffectLibrary,
    ctx: moderngl.Context,
    effect_id: str,
    size: tuple[int, int],
    data: bytes,
    params: dict[str, float],
) -> bytes:
    program = library.get(effect_id)
    assert program is not None
    texture = ctx.texture(size, 4, data)
    fbo = ctx.simple_framebuffer(size, components=4)
    try:
        fbo.use()
        texture.use(location=IMAGE_TEXTURE_UNIT)
        program.set_uniforms(resolution=size, params=params)
        program.draw()
        return fbo.read(components=4, alignment=1)
    finally:
        texture.release()
        fbo.release()


def _pixel(data: bytes, index: int) -> tuple[int, ...]:
    return tuple(data[index * 4 : index * 4 + 4])


# --- Blur: 3x3 box average ------------------------------------------------------


@requires_gl
def test_blur_averages_a_bright_impulse_over_three_taps(
    library: EffectLibrary, ctx: moderngl.Context
) -> None:
    width = 640
    row = bytearray((0, 0, 0, 255) * width)
    row[320 * 4 : 320 * 4 + 4] = bytes((255, 255, 255, 255))
    result = _draw(library, ctx, "blur", (width, 1), bytes(row), {"radius": 1})
    # Height 1: every dy clamps to the same row, so this is effectively a
    # tripled 3-tap horizontal average: (left + centre + right) / 3.
    for x in (319, 320, 321):
        assert _pixel(result, x)[:3] == pytest.approx((85, 85, 85), abs=2)
    for x in (300, 318, 322, 340):
        assert _pixel(result, x)[:3] == pytest.approx((0, 0, 0), abs=2)


# --- Pixelate (effect): fixed block size ----------------------------------------


@requires_gl
def test_pixelate_snaps_to_the_block_centre_texel(
    library: EffectLibrary, ctx: moderngl.Context
) -> None:
    width = 640
    # Texel i -> colour (i % 256, 0, 0): every texel individually identifiable.
    row = bytes(b for i in range(width) for b in (i % 256, 0, 0, 255))
    # blockSize=7 (odd) at resolution.x=640 (scale factor 1): block centres land
    # exactly on a texel, no half-texel sampling ambiguity.
    result = _draw(library, ctx, "pixelate", (width, 1), row, {"blockSize": 7})
    for x in range(70, 77):  # block 10 (texels 70-76) -> centre texel 73
        assert _pixel(result, x)[0] == 73
    for x in range(77, 84):  # block 11 (texels 77-83) -> centre texel 80
        assert _pixel(result, x)[0] == 80


# --- Film aging: vignette + grain + desaturation, scaled by `age` --------------


@requires_gl
@pytest.mark.parametrize(
    ("effect_id", "age", "expected"),
    [
        ("film-age-old", 30, (184, 99, 56)),
        ("film-age-older", 60, (168, 98, 63)),
        ("film-age-oldest", 90, (152, 97, 69)),
    ],
)
def test_film_age_desaturates_and_grains_by_intensity(
    library: EffectLibrary,
    ctx: moderngl.Context,
    effect_id: str,
    age: float,
    expected: tuple[int, int, int],
) -> None:
    size = (7, 7)
    color = (200, 100, 50, 255)
    data = bytes(color) * (size[0] * size[1])
    result = _draw(library, ctx, effect_id, size, data, {"age": age})
    # Centre pixel (3, 3) of a 7x7 frame: uv = (0.5, 0.5), so the vignette term
    # is exactly 1 and only desaturation + the deterministic grain act on it.
    centre_index = 3 * size[0] + 3
    assert _pixel(result, centre_index)[:3] == pytest.approx(expected, abs=2)


# --- Film grain: deterministic per-pixel noise ----------------------------------


@requires_gl
def test_film_grain_matches_the_independently_ported_hash(
    library: EffectLibrary, ctx: moderngl.Context
) -> None:
    size = (8, 8)
    color = (100, 100, 100, 255)
    data = bytes(color) * (size[0] * size[1])
    amount = 0.2
    result = _draw(library, ctx, "film-grain", size, data, {"amount": amount})
    base = color[0] / 255
    for x, y in ((3, 2), (0, 0), (5, 5)):
        expected = _to_u8(base + _noise_for(x, y, amount))
        index = y * size[0] + x
        assert _pixel(result, index)[:3] == pytest.approx((expected, expected, expected), abs=2)


# --- Charcoal / pen and ink: Sobel edge magnitude -------------------------------

_SOBEL_EDGE = 3.2
"""Gx at (320, *) of the test pattern below (Gy=0, rows identical)."""
_SOBEL_CENTRE_X = 320


def _sobel_test_pattern() -> tuple[tuple[int, int], bytes]:
    # Width 640 (so the shader's 640 px-width-relative step is exactly 1
    # texel - a narrower texture would make the "neighbour" sample fall back
    # inside the same texel) x 3 identical rows (isolates Gx, Gy=0). Column
    # 319 is dark (luma ~0.1), 320 the Sobel centre pixel (its own colour
    # never enters the 8-neighbour gradient), 321 bright (luma ~0.9);
    # everything else is the same mid grey as 320 and never sampled by the
    # assertions below.
    mid = (128, 128, 128, 255)
    dark = (26, 26, 26, 255)
    bright = (230, 230, 230, 255)
    row = bytearray(mid * 640)
    row[319 * 4 : 319 * 4 + 4] = bytes(dark)
    row[_SOBEL_CENTRE_X * 4 : _SOBEL_CENTRE_X * 4 + 4] = bytes(mid)
    row[321 * 4 : 321 * 4 + 4] = bytes(bright)
    return (640, 3), bytes(row) * 3


@requires_gl
def test_charcoal_darkens_proportionally_to_the_edge(
    library: EffectLibrary, ctx: moderngl.Context
) -> None:
    size, data = _sobel_test_pattern()
    result = _draw(library, ctx, "charcoal", size, data, {"strength": 0.2})
    expected = _to_u8(0.85 - _SOBEL_EDGE * 0.2)
    index = 1 * size[0] + _SOBEL_CENTRE_X  # middle row, centre column
    assert _pixel(result, index)[:3] == pytest.approx((expected, expected, expected), abs=2)


@requires_gl
@pytest.mark.parametrize(
    ("threshold", "expected"),
    [(1.0, 0), (5.0, 255)],  # edge (3.2) above/below the threshold
)
def test_pen_and_ink_thresholds_the_edge_to_black_or_white(
    library: EffectLibrary, ctx: moderngl.Context, threshold: float, expected: int
) -> None:
    size, data = _sobel_test_pattern()
    result = _draw(library, ctx, "pen-and-ink", size, data, {"threshold": threshold})
    index = 1 * size[0] + _SOBEL_CENTRE_X
    assert _pixel(result, index)[:3] == (expected, expected, expected)


# --- Watercolor: box smoothing + posterize --------------------------------------


@requires_gl
def test_watercolor_smooths_then_quantizes(library: EffectLibrary, ctx: moderngl.Context) -> None:
    width = 640
    row = bytearray((0, 0, 0, 255) * width)
    row[320 * 4 : 320 * 4 + 4] = bytes((255, 255, 255, 255))
    result = _draw(library, ctx, "watercolor", (width, 1), bytes(row), {"radius": 1, "levels": 4})
    # Same blur as above (1/3 at x in {319,320,321}), then posterize(1/3, 4):
    # floor(1.3333)/3 = 1/3 again - comfortably mid-bucket, no boundary risk.
    for x in (319, 320, 321):
        assert _pixel(result, x)[:3] == pytest.approx((85, 85, 85), abs=2)
    for x in (300, 318, 322, 340):
        assert _pixel(result, x)[:3] == pytest.approx((0, 0, 0), abs=2)
