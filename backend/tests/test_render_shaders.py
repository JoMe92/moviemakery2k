"""Shader loader of the export (TASK-RENDER-002, design.md D1/D2).

The source-text tests run everywhere. The GL tests need the EGL/llvmpipe
context from the Pixi environment and always run on Linux (locally and in CI);
they are skipped only on other platforms (export there without guarantee).
"""

import logging
import shutil
from collections.abc import Iterator
from pathlib import Path

import moderngl
import pytest
from conftest import requires_gl

from mmy_backend.catalog import TransitionCatalog, load_catalog
from mmy_backend.config import DEFAULT_SHADERS_DIR, REPO_ROOT, Settings
from mmy_backend.render.shaders import (
    CORE_HEADER,
    ES_HEADER,
    FALLBACK_TRANSITION_ID,
    FROM_TEXTURE_UNIT,
    TO_TEXTURE_UNIT,
    ShaderError,
    ShaderLibrary,
    ShaderSources,
    build_fragment_source,
    to_desktop_glsl,
)

CATALOG_FILE = REPO_ROOT / "packages" / "catalog" / "transitions.json"
MVP_IDS = {"fade", "dissolve", "wipe-right", "circle", "pixelate", "checkerboard"}


@pytest.fixture(scope="module")
def catalog() -> TransitionCatalog:
    return load_catalog(CATALOG_FILE)


@pytest.fixture
def sources() -> ShaderSources:
    return ShaderSources(DEFAULT_SHADERS_DIR)


@pytest.fixture
def library(ctx: moderngl.Context, sources: ShaderSources) -> Iterator[ShaderLibrary]:
    lib = ShaderLibrary(ctx, sources)
    try:
        yield lib
    finally:
        lib.release()


def _uniform(program: moderngl.Program, name: str) -> moderngl.Uniform:
    member = program[name]
    assert isinstance(member, moderngl.Uniform)
    return member


def _copy_shaders(dest: Path) -> Path:
    shutil.copytree(DEFAULT_SHADERS_DIR, dest, ignore=shutil.ignore_patterns("node_modules"))
    return dest


# --- Source texts (contract of shaderSource.ts) -------------------------------


def test_settings_default_and_env_shaders_dir(tmp_path: Path) -> None:
    assert Settings.from_env({}).shaders_dir == REPO_ROOT / "packages" / "shaders"
    env = {"MMY_SHADERS_DIR": str(tmp_path)}
    assert Settings.from_env(env).shaders_dir == tmp_path.resolve()


def test_catalog_covers_the_mvp_transitions_with_shader_files(
    catalog: TransitionCatalog, sources: ShaderSources
) -> None:
    ids = {t.id for t in catalog.transitions}
    assert ids >= MVP_IDS
    assert len(ids) > len(MVP_IDS)
    for transition in catalog.transitions:
        # shaderSource.ts looks up the body by file name, i.e. by the ID.
        assert transition.shader == f"{transition.id}.glsl"
        assert sources.body(transition.id) is not None


def test_build_fragment_source_trims_and_joins_like_ts() -> None:
    # `${prelude.trim()}\n\n${body.trim()}\n\n${epilogue.trim()}\n`
    assert build_fragment_source("\ufeff P \n\n", "\n\tB\r\n", "  E\n") == "P\n\nB\n\nE\n"


def test_fragment_source_contains_prelude_body_epilogue(
    catalog: TransitionCatalog, sources: ShaderSources
) -> None:
    prelude = (DEFAULT_SHADERS_DIR / "prelude.glsl").read_text(encoding="utf-8")
    epilogue = (DEFAULT_SHADERS_DIR / "epilogue.glsl").read_text(encoding="utf-8")
    for transition in catalog.transitions:
        body = (DEFAULT_SHADERS_DIR / "transitions" / transition.shader).read_text(encoding="utf-8")
        es = sources.fragment_source(transition.id)
        assert es == f"{prelude.strip()}\n\n{body.strip()}\n\n{epilogue.strip()}\n"

        desktop = sources.desktop_fragment_source(transition.id)
        assert desktop is not None
        assert desktop.startswith(CORE_HEADER + "\n")
        assert desktop.count("#version") == 1
        assert ES_HEADER not in desktop
        # Exactly the first line is replaced, everything else is byte-identical.
        assert desktop.removeprefix(CORE_HEADER) == es.removeprefix(ES_HEADER)
        assert "vec4 transition(vec2 uv)" in desktop
        assert desktop.rstrip().endswith("fragColor = transition(vUv);\n}")


def test_vertex_source_is_raw_file_with_header_replaced(sources: ShaderSources) -> None:
    raw = (DEFAULT_SHADERS_DIR / "vertex.glsl").read_text(encoding="utf-8")
    assert sources.vertex == raw
    desktop = sources.desktop_vertex_source()
    assert desktop == CORE_HEADER + raw.removeprefix(ES_HEADER)
    assert "gl_VertexID" in desktop


def test_missing_body_yields_none(sources: ShaderSources) -> None:
    assert sources.fragment_source("does-not-exist") is None
    assert sources.fragment_source("../prelude") is None


@pytest.mark.parametrize(
    "source",
    [
        "#version 330 core\nvoid main() {}\n",
        "// comment\n#version 300 es\nvoid main() {}\n",
        "#version 300 es\n#version 300 es\nvoid main() {}\n",
        "#version 300 es",
    ],
)
def test_to_desktop_glsl_requires_exactly_one_leading_es_header(source: str) -> None:
    with pytest.raises(ShaderError):
        to_desktop_glsl(source)


def test_to_desktop_glsl_keeps_crlf() -> None:
    assert to_desktop_glsl("#version 300 es\r\nx\r\n") == "#version 330 core\r\nx\r\n"


# --- GL: compile, fallback, uniforms -------------------------------------------


@requires_gl
def test_context_is_llvmpipe(ctx: moderngl.Context) -> None:
    assert "llvmpipe" in ctx.info["GL_RENDERER"]
    assert ctx.version_code >= 330


@requires_gl
def test_all_catalog_transitions_compile_and_link(
    catalog: TransitionCatalog, library: ShaderLibrary
) -> None:
    for transition in catalog.transitions:
        entry = library.get(transition.id)
        # No fallback: every program is its own shader.
        assert entry.shader_id == transition.id
        assert library.get(transition.id) is entry
    distinct = {id(library.get(t.id).program) for t in catalog.transitions}
    assert len(distinct) == len(catalog.transitions)


@requires_gl
def test_missing_shader_falls_back_to_fade(
    library: ShaderLibrary, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING, logger="mmy_backend.render.shaders"):
        entry = library.get("does-not-exist")
    assert entry.shader_id == FALLBACK_TRANSITION_ID
    assert entry is library.get(FALLBACK_TRANSITION_ID)
    assert "does-not-exist" in caplog.text


@requires_gl
def test_removed_shader_file_falls_back_to_fade(ctx: moderngl.Context, tmp_path: Path) -> None:
    shaders = _copy_shaders(tmp_path / "shaders")
    (shaders / "transitions" / "circle.glsl").unlink()
    lib = ShaderLibrary(ctx, ShaderSources(shaders))
    try:
        assert lib.get("circle").shader_id == FALLBACK_TRANSITION_ID
        assert lib.get("wipe-right").shader_id == "wipe-right"
    finally:
        lib.release()


@requires_gl
def test_broken_shader_falls_back_to_fade(
    ctx: moderngl.Context, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    shaders = _copy_shaders(tmp_path / "shaders")
    (shaders / "transitions" / "circle.glsl").write_text(
        "vec4 transition(vec2 uv) { return undefinedThing; }\n", encoding="utf-8"
    )
    lib = ShaderLibrary(ctx, ShaderSources(shaders))
    try:
        with caplog.at_level(logging.WARNING, logger="mmy_backend.render.shaders"):
            assert lib.get("circle").shader_id == FALLBACK_TRANSITION_ID
        assert "circle" in caplog.text
    finally:
        lib.release()


@requires_gl
def test_missing_fade_raises(ctx: moderngl.Context, tmp_path: Path) -> None:
    shaders = _copy_shaders(tmp_path / "shaders")
    (shaders / "transitions" / "fade.glsl").unlink()
    (shaders / "transitions" / "circle.glsl").unlink()
    lib = ShaderLibrary(ctx, ShaderSources(shaders))
    try:
        with pytest.raises(ShaderError):
            lib.get("circle")
    finally:
        lib.release()


@requires_gl
def test_uniforms_set_for_every_catalog_entry(
    catalog: TransitionCatalog, library: ShaderLibrary
) -> None:
    for transition in catalog.transitions:
        entry = library.get(transition.id)
        entry.set_uniforms(progress=1.5, resolution=(960, 720), params=transition.params)
        program = entry.program

        assert _uniform(program, "uFrom").value == FROM_TEXTURE_UNIT
        assert _uniform(program, "uTo").value == TO_TEXTURE_UNIT
        assert _uniform(program, "progress").value == pytest.approx(1.0)
        resolution = program.get("resolution", None)
        # fade, wipe-right and checkerboard do not read `resolution`; the compiler removes it.
        if isinstance(resolution, moderngl.Uniform):
            assert resolution.value == pytest.approx((960.0, 720.0))
        else:
            assert transition.id in {"fade", "checkerboard", "wipe-right"}
        for name, value in transition.params.items():
            uniform = program.get(name, None)
            # Every catalog parameter is an active `uniform float` in the shader.
            assert isinstance(uniform, moderngl.Uniform), (transition.id, name)
            assert uniform.dimension == 1
            assert uniform.value == pytest.approx(value)

        entry.set_uniforms(progress=-1.0, resolution=(640, 480), params={"unknown": 1.0})
        assert _uniform(program, "progress").value == pytest.approx(0.0)


@requires_gl
def test_fullscreen_triangle_draws_fade(library: ShaderLibrary, ctx: moderngl.Context) -> None:
    red = ctx.texture((2, 2), 4, bytes([255, 0, 0, 255] * 4))
    blue = ctx.texture((2, 2), 4, bytes([0, 0, 255, 255] * 4))
    fbo = ctx.simple_framebuffer((4, 4), components=4)
    try:
        fbo.use()
        red.use(location=FROM_TEXTURE_UNIT)
        blue.use(location=TO_TEXTURE_UNIT)
        entry = library.get(FALLBACK_TRANSITION_ID)
        for progress, expected in ((0.0, (255, 0, 0, 255)), (1.0, (0, 0, 255, 255))):
            fbo.clear(0.0, 0.0, 0.0, 0.0)
            entry.set_uniforms(progress=progress, resolution=fbo.size, params={})
            entry.draw()
            for x, y in ((0, 0), (3, 3)):
                assert tuple(fbo.read(viewport=(x, y, 1, 1), components=4)) == expected
    finally:
        red.release()
        blue.release()
        fbo.release()
