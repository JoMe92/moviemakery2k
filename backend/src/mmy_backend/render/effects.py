"""Effect shader loader of the export (design.md D1/D2): the same GLSL files as the preview.

Mirrors `apps/web/src/render/effectSource.ts` and the effect-pass part of
`apps/web/src/render/Renderer.ts`:

- Fragment program = `effect-prelude.glsl` + `effects/<id>.glsl` +
  `effect-epilogue.glsl`, exactly like `shaders.build_fragment_source` for
  transitions.
- One input texture (`uImage`, unit `IMAGE_TEXTURE_UNIT`), no `progress`.
- Unlike transitions there is no fallback effect: a missing or broken effect
  shader is logged and `EffectLibrary.get` returns `None` — the caller keeps
  the image unchanged (design.md D2: "ohne gesetzten Effekt entfällt der
  Durchgang").
"""

import logging
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path

import moderngl

from mmy_backend.render.shaders import (
    FULLSCREEN_TRIANGLE_VERTICES,
    build_fragment_source,
    to_desktop_glsl,
)

logger = logging.getLogger(__name__)

IMAGE_TEXTURE_UNIT = 0
"""Texture unit of the input image (`uImage`)."""


class EffectSources:
    """Reads `packages/shaders` (Settings.shaders_dir); each file is read once."""

    def __init__(self, shaders_dir: Path) -> None:
        self.shaders_dir = shaders_dir
        self._files: dict[Path, str | None] = {}

    def _read(self, path: Path) -> str | None:
        if path not in self._files:
            try:
                self._files[path] = path.read_text(encoding="utf-8")
            except FileNotFoundError:
                self._files[path] = None
        return self._files[path]

    def _required(self, name: str) -> str:
        text = self._read(self.shaders_dir / name)
        if text is None:
            raise FileNotFoundError(f"Shader file {self.shaders_dir / name} is missing.")
        return text

    @property
    def prelude(self) -> str:
        return self._required("effect-prelude.glsl")

    @property
    def epilogue(self) -> str:
        return self._required("effect-epilogue.glsl")

    def body(self, effect_id: str) -> str | None:
        """Raw effect shader `effects/<id>.glsl`; None if it does not exist."""
        return self._read(self.shaders_dir / "effects" / f"{effect_id}.glsl")

    def fragment_source(self, effect_id: str) -> str | None:
        """GLSL ES fragment program like `effectFragmentSourceFor` in TS; None without a shader."""
        body = self.body(effect_id)
        if body is None:
            return None
        return build_fragment_source(self.prelude, body, self.epilogue)

    def desktop_fragment_source(self, effect_id: str) -> str | None:
        """Fragment program with `#version 330 core`; None without a shader."""
        source = self.fragment_source(effect_id)
        return None if source is None else to_desktop_glsl(source)


@dataclass(frozen=True, slots=True, eq=False)
class EffectProgram:
    """A linked effect program with an empty VAO for the full-screen triangle."""

    effect_id: str
    program: moderngl.Program
    vao: moderngl.VertexArray

    def _uniform(self, name: str) -> moderngl.Uniform | None:
        member = self.program.get(name, None)
        return member if isinstance(member, moderngl.Uniform) else None

    def set_uniforms(self, *, resolution: tuple[int, int], params: Mapping[str, float]) -> None:
        """Sets all uniforms like `Renderer.resolveEffect` in the browser.

        The caller binds the image texture itself to IMAGE_TEXTURE_UNIT.
        """
        values: dict[str, int | float | tuple[float, float]] = {
            "uImage": IMAGE_TEXTURE_UNIT,
            "resolution": (float(resolution[0]), float(resolution[1])),
        }
        for name, param in params.items():
            values[name] = float(param)
        for name, value in values.items():
            uniform = self._uniform(name)
            if uniform is not None:
                uniform.value = value

    def draw(self) -> None:
        """Draws the full-screen triangle into the currently bound framebuffer."""
        self.vao.render(moderngl.TRIANGLES, vertices=FULLSCREEN_TRIANGLE_VERTICES)


class EffectLibrary:
    """Programs per effect ID, compiled lazily and cached (like `Renderer.effectProgramFor`).

    No fallback: `get` returns None on a missing/broken shader instead of raising,
    so the caller can simply skip the effect pass (design.md D2).
    """

    def __init__(self, ctx: moderngl.Context, sources: EffectSources) -> None:
        self.ctx = ctx
        self.sources = sources
        self._programs: dict[str, EffectProgram | None] = {}

    def precompile(self, effect_ids: Iterable[str]) -> None:
        for effect_id in effect_ids:
            self.get(effect_id)

    def get(self, effect_id: str) -> EffectProgram | None:
        """Program for the effect; None if the shader is missing or fails to compile/link."""
        if effect_id in self._programs:
            return self._programs[effect_id]

        program: EffectProgram | None = None
        source = self.sources.desktop_fragment_source(effect_id)
        if source is None:
            logger.warning("No shader for effect %r; the effect is skipped.", effect_id)
        else:
            program = self._compile(effect_id, source)
        self._programs[effect_id] = program
        return program

    def _compile(self, effect_id: str, fragment_source: str) -> EffectProgram | None:
        try:
            program = self.ctx.program(
                vertex_shader=to_desktop_glsl(self._vertex_source()),
                fragment_shader=fragment_source,
            )
        except moderngl.Error as exc:
            logger.warning("Effect %r failed to compile/link: %s", effect_id, exc)
            return None
        vao = self.ctx.vertex_array(program, [])
        return EffectProgram(effect_id=effect_id, program=program, vao=vao)

    def _vertex_source(self) -> str:
        return (self.sources.shaders_dir / "vertex.glsl").read_text(encoding="utf-8")

    def release(self) -> None:
        """Releases all programs and VAOs (the context stays with the caller)."""
        for entry in self._programs.values():
            if entry is None:
                continue
            entry.vao.release()
            entry.program.release()
        self._programs.clear()
