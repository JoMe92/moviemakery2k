"""Effect shader loader and golden frames of the export (TASK-FX-008, design.md D1/D2).

The golden frames stay in GL space throughout (both the uploaded texture and
the read-back framebuffer use OpenGL's own bottom-row-first convention), so
expected pixels can be derived directly from the `uv` formula in each
`effects/<id>.glsl` file without any PIL/letterbox flipping.
"""

import logging
from collections.abc import Iterator
from pathlib import Path

import moderngl
import pytest
from conftest import requires_gl

from mmy_backend.catalog import EffectCatalog, load_effect_catalog
from mmy_backend.config import DEFAULT_SHADERS_DIR, REPO_ROOT
from mmy_backend.render.effects import IMAGE_TEXTURE_UNIT, EffectLibrary, EffectSources

CATALOG_FILE = REPO_ROOT / "packages" / "catalog" / "effects.json"
# This file's own subset (TASK-FX-008); the catalog also carries TASK-FX-009's
# entries by now (see test_render_stylized_effects.py) - checked as a subset,
# not an exact match, same as test_effect_catalog_file.py.
EXPECTED_IDS = {
    "sepia",
    "negative",
    "posterize",
    "threshold",
    "grayscale",
    "brightness-up",
    "brightness-down",
    "mirror-horizontal",
    "mirror-vertical",
    "rotate-90",
    "rotate-180",
    "rotate-270",
}

RED = (255, 0, 0, 255)
GREEN = (0, 255, 0, 255)
BLUE = (0, 0, 255, 255)
YELLOW = (255, 255, 0, 255)
# 2x2, row-major, row 0 first = GL "bottom" row (same convention on upload and read-back):
# BL=red, BR=green (row 0); TL=blue, TR=yellow (row 1).
FOUR_CORNERS = RED + GREEN + BLUE + YELLOW


@pytest.fixture(scope="module")
def catalog() -> EffectCatalog:
    return load_effect_catalog(CATALOG_FILE)


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


def _copy_shaders(dest: Path) -> Path:
    import shutil

    shutil.copytree(DEFAULT_SHADERS_DIR, dest, ignore=shutil.ignore_patterns("node_modules"))
    return dest


# --- Source texts (contract of effectSource.ts) -------------------------------


def test_catalog_covers_the_fx_008_effects_with_shader_files(
    catalog: EffectCatalog, sources: EffectSources
) -> None:
    assert {e.id for e in catalog.effects} >= EXPECTED_IDS
    for effect in catalog.effects:
        assert effect.shader == f"{effect.id}.glsl"
        assert sources.body(effect.id) is not None


def test_fragment_source_contains_prelude_body_epilogue(
    catalog: EffectCatalog, sources: EffectSources
) -> None:
    prelude = (DEFAULT_SHADERS_DIR / "effect-prelude.glsl").read_text(encoding="utf-8")
    epilogue = (DEFAULT_SHADERS_DIR / "effect-epilogue.glsl").read_text(encoding="utf-8")
    for effect in catalog.effects:
        body = (DEFAULT_SHADERS_DIR / "effects" / effect.shader).read_text(encoding="utf-8")
        es = sources.fragment_source(effect.id)
        assert es == f"{prelude.strip()}\n\n{body.strip()}\n\n{epilogue.strip()}\n"
        desktop = sources.desktop_fragment_source(effect.id)
        assert desktop is not None
        assert desktop.startswith("#version 330 core\n")
        assert "vec4 effect(vec2 uv)" in desktop


def test_missing_body_yields_none(sources: EffectSources) -> None:
    assert sources.fragment_source("does-not-exist") is None


# --- GL: compile, uniforms ------------------------------------------------------


@requires_gl
def test_all_catalog_effects_compile_and_link(
    catalog: EffectCatalog, library: EffectLibrary
) -> None:
    for effect in catalog.effects:
        program = library.get(effect.id)
        assert program is not None
        assert program.effect_id == effect.id
        assert library.get(effect.id) is program


@requires_gl
def test_missing_shader_is_skipped_and_logged(
    library: EffectLibrary, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="mmy_backend.render.effects"):
        assert library.get("does-not-exist") is None
    assert "does-not-exist" in caplog.text


@requires_gl
def test_broken_shader_is_skipped_and_logged(
    ctx: moderngl.Context, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    shaders = _copy_shaders(tmp_path / "shaders")
    (shaders / "effects" / "sepia.glsl").write_text(
        "vec4 effect(vec2 uv) { return undefinedThing; }\n", encoding="utf-8"
    )
    lib = EffectLibrary(ctx, EffectSources(shaders))
    try:
        with caplog.at_level(logging.WARNING, logger="mmy_backend.render.effects"):
            assert lib.get("sepia") is None
        assert "sepia" in caplog.text
        # Unaffected effects still compile.
        assert lib.get("negative") is not None
    finally:
        lib.release()


@requires_gl
def test_uniforms_set_for_every_catalog_entry(
    catalog: EffectCatalog, library: EffectLibrary
) -> None:
    for effect in catalog.effects:
        program = library.get(effect.id)
        assert program is not None
        program.set_uniforms(resolution=(960, 720), params=effect.params)
        uniforms_module = program.program
        image_uniform = uniforms_module.get("uImage", None)
        assert isinstance(image_uniform, moderngl.Uniform)
        assert image_uniform.value == IMAGE_TEXTURE_UNIT
        resolution = uniforms_module.get("resolution", None)
        if isinstance(resolution, moderngl.Uniform):
            assert resolution.value == pytest.approx((960.0, 720.0))
        for name, value in effect.params.items():
            uniform = uniforms_module.get(name, None)
            assert isinstance(uniform, moderngl.Uniform), (effect.id, name)
            assert uniform.value == pytest.approx(value)


# --- Golden frames (GL): colour-math effects ------------------------------------


def _draw_on_solid(
    library: EffectLibrary,
    ctx: moderngl.Context,
    effect_id: str,
    color: tuple[int, int, int, int],
    params: dict[str, float],
) -> tuple[int, ...]:
    program = library.get(effect_id)
    assert program is not None
    texture = ctx.texture((1, 1), 4, bytes(color))
    fbo = ctx.simple_framebuffer((1, 1), components=4)
    try:
        fbo.use()
        texture.use(location=IMAGE_TEXTURE_UNIT)
        program.set_uniforms(resolution=(1, 1), params=params)
        program.draw()
        return tuple(fbo.read(components=4, alignment=1))
    finally:
        texture.release()
        fbo.release()


@requires_gl
def test_sepia_applies_the_colour_matrix(library: EffectLibrary, ctx: moderngl.Context) -> None:
    result = _draw_on_solid(library, ctx, "sepia", (100, 150, 200, 255), {})
    assert result[:3] == pytest.approx((192, 171, 134), abs=2)
    assert result[3] == 255


@requires_gl
def test_negative_inverts_every_channel(library: EffectLibrary, ctx: moderngl.Context) -> None:
    result = _draw_on_solid(library, ctx, "negative", (100, 150, 200, 255), {})
    assert result == (155, 105, 55, 255)


@requires_gl
def test_grayscale_is_bt601_luma(library: EffectLibrary, ctx: moderngl.Context) -> None:
    result = _draw_on_solid(library, ctx, "grayscale", (100, 150, 200, 255), {})
    assert result[0] == result[1] == result[2] == pytest.approx(141, abs=2)


@requires_gl
def test_brightness_up_adds_and_clamps(library: EffectLibrary, ctx: moderngl.Context) -> None:
    result = _draw_on_solid(library, ctx, "brightness-up", (100, 150, 200, 255), {"amount": 0.25})
    assert result[:3] == pytest.approx((164, 214, 255), abs=2)


@requires_gl
def test_brightness_down_subtracts(library: EffectLibrary, ctx: moderngl.Context) -> None:
    result = _draw_on_solid(library, ctx, "brightness-down", (100, 150, 200, 255), {"amount": 0.25})
    assert result[:3] == pytest.approx((36, 86, 136), abs=2)


@requires_gl
def test_posterize_quantizes_to_four_levels(library: EffectLibrary, ctx: moderngl.Context) -> None:
    result = _draw_on_solid(library, ctx, "posterize", (10, 130, 250, 255), {"levels": 4})
    assert result[:3] == pytest.approx((0, 170, 255), abs=2)


@requires_gl
@pytest.mark.parametrize(
    ("color", "expected"),
    [
        ((30, 30, 30, 255), (0, 0, 0)),
        ((220, 220, 220, 255), (255, 255, 255)),
    ],
)
def test_threshold_splits_dark_and_bright(
    library: EffectLibrary,
    ctx: moderngl.Context,
    color: tuple[int, int, int, int],
    expected: tuple[int, int, int],
) -> None:
    result = _draw_on_solid(library, ctx, "threshold", color, {"threshold": 0.5})
    assert result[:3] == expected


# --- Golden frames (GL): geometry effects ---------------------------------------


def _draw_four_corners(
    library: EffectLibrary, ctx: moderngl.Context, effect_id: str
) -> tuple[int, ...]:
    program = library.get(effect_id)
    assert program is not None
    texture = ctx.texture((2, 2), 4, bytes(FOUR_CORNERS))
    fbo = ctx.simple_framebuffer((2, 2), components=4)
    try:
        fbo.use()
        texture.use(location=IMAGE_TEXTURE_UNIT)
        program.set_uniforms(resolution=(2, 2), params={})
        program.draw()
        return tuple(fbo.read(components=4, alignment=1))
    finally:
        texture.release()
        fbo.release()


@requires_gl
def test_mirror_horizontal_flips_left_right(library: EffectLibrary, ctx: moderngl.Context) -> None:
    assert _draw_four_corners(library, ctx, "mirror-horizontal") == GREEN + RED + YELLOW + BLUE


@requires_gl
def test_mirror_vertical_flips_top_bottom(library: EffectLibrary, ctx: moderngl.Context) -> None:
    assert _draw_four_corners(library, ctx, "mirror-vertical") == BLUE + YELLOW + RED + GREEN


@requires_gl
def test_rotate_180_is_a_point_reflection(library: EffectLibrary, ctx: moderngl.Context) -> None:
    assert _draw_four_corners(library, ctx, "rotate-180") == YELLOW + BLUE + GREEN + RED


@requires_gl
def test_rotate_90_is_clockwise(library: EffectLibrary, ctx: moderngl.Context) -> None:
    assert _draw_four_corners(library, ctx, "rotate-90") == GREEN + YELLOW + RED + BLUE


@requires_gl
def test_rotate_270_is_counter_clockwise(library: EffectLibrary, ctx: moderngl.Context) -> None:
    assert _draw_four_corners(library, ctx, "rotate-270") == BLUE + RED + YELLOW + GREEN
