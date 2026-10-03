"""Shader loader of the export (design.md D2): the same GLSL files as the preview.

Mirrors `apps/web/src/render/shaderSource.ts` and the program part of
`apps/web/src/render/Renderer.ts`:

- Fragment program = `prelude.glsl` + `transitions/<id>.glsl` + `epilogue.glsl`,
  each trimmed and joined with a blank line, with a trailing newline.
- Vertex shader = `vertex.glsl` unchanged; a full-screen triangle is drawn
  without a vertex buffer (3 vertices, empty VAO).
- For the desktop GL context the first line `#version 300 es` is replaced
  exactly once with `#version 330 core`; nothing else.
- If a transition's shader is missing or fails to compile/link, this is logged
  and `fade` is used.
- Uniforms: `uFrom` = texture unit 0, `uTo` = unit 1, `progress` clamped to
  [0, 1], `resolution` = output size in pixels, every catalog parameter as a
  `uniform float` of the same name; missing (or compiler-removed) uniforms are
  silently skipped, as in the browser.
"""

import logging
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path

import moderngl

logger = logging.getLogger(__name__)

FALLBACK_TRANSITION_ID = "fade"
"""Transition to fall back to when a shader is missing or broken."""

ES_HEADER = "#version 300 es"
CORE_HEADER = "#version 330 core"

FROM_TEXTURE_UNIT = 0
"""Texture unit of the source image (`uFrom`)."""
TO_TEXTURE_UNIT = 1
"""Texture unit of the target image (`uTo`)."""
TITLE_TEXTURE_UNIT = 0
"""Texture unit of a title/credits texture (`uTitle`); drawn in its own program."""

FULLSCREEN_TRIANGLE_VERTICES = 3

# Like the catalog IDs (catalog.TransitionId); also protects against paths like `../x`.
_TRANSITION_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

# Characters removed by JavaScript's String.prototype.trim (WhiteSpace + LineTerminator).
_JS_TRIM_CHARS = "".join(
    chr(code)
    for code in (
        *range(0x09, 0x0E),  # \t \n \v \f \r
        0x20,
        0xA0,
        0x1680,
        *range(0x2000, 0x200B),
        0x2028,
        0x2029,
        0x202F,
        0x205F,
        0x3000,
        0xFEFF,
    )
)


class ShaderError(Exception):
    """A shader source violates the contract or the fade program is unusable."""


def _js_trim(text: str) -> str:
    return text.strip(_JS_TRIM_CHARS)


def build_fragment_source(prelude: str, body: str, epilogue: str) -> str:
    """GLSL ES fragment program, character for character like `buildFragmentSource` in TS."""
    return f"{_js_trim(prelude)}\n\n{_js_trim(body)}\n\n{_js_trim(epilogue)}\n"


def to_desktop_glsl(source: str) -> str:
    """Replaces the first line `#version 300 es` with `#version 330 core`, exactly once.

    Raises ShaderError if the source does not start with this line or contains
    another `#version` directive.
    """
    first_line, newline, rest = source.partition("\n")
    if first_line.rstrip("\r") != ES_HEADER or not newline:
        raise ShaderError(f"Shader does not start with the line {ES_HEADER!r}.")
    if "#version" in rest:
        raise ShaderError("Shader contains more than one #version directive.")
    return CORE_HEADER + first_line[len(ES_HEADER) :] + newline + rest


class ShaderSources:
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
            raise ShaderError(f"Shader file {self.shaders_dir / name} is missing.")
        return text

    @property
    def prelude(self) -> str:
        return self._required("prelude.glsl")

    @property
    def epilogue(self) -> str:
        return self._required("epilogue.glsl")

    @property
    def vertex(self) -> str:
        """`vertex.glsl` raw (GLSL ES 3.00), like `VERTEX_SOURCE` in TS."""
        return self._required("vertex.glsl")

    @property
    def title_vertex(self) -> str:
        """`title-vertex.glsl` raw, like `TITLE_VERTEX_SOURCE` in TS."""
        return self._required("title-vertex.glsl")

    @property
    def title_fragment(self) -> str:
        """`title-fragment.glsl` raw, like `TITLE_FRAGMENT_SOURCE` in TS."""
        return self._required("title-fragment.glsl")

    def body(self, transition_id: str) -> str | None:
        """Raw transition shader `transitions/<id>.glsl`; None if it does not exist."""
        if not _TRANSITION_ID.fullmatch(transition_id):
            return None
        return self._read(self.shaders_dir / "transitions" / f"{transition_id}.glsl")

    def fragment_source(self, transition_id: str) -> str | None:
        """GLSL ES fragment program like `fragmentSourceFor` in TS; None without a shader."""
        body = self.body(transition_id)
        if body is None:
            return None
        return build_fragment_source(self.prelude, body, self.epilogue)

    def desktop_fragment_source(self, transition_id: str) -> str | None:
        """Fragment program with `#version 330 core`; None without a shader."""
        source = self.fragment_source(transition_id)
        return None if source is None else to_desktop_glsl(source)

    def desktop_vertex_source(self) -> str:
        return to_desktop_glsl(self.vertex)

    def desktop_title_vertex_source(self) -> str:
        return to_desktop_glsl(self.title_vertex)

    def desktop_title_fragment_source(self) -> str:
        return to_desktop_glsl(self.title_fragment)


@dataclass(frozen=True, slots=True, eq=False)
class TransitionProgram:
    """A linked transition program with an empty VAO for the full-screen triangle."""

    shader_id: str
    """Shader actually compiled (`fade` on fallback)."""
    program: moderngl.Program
    vao: moderngl.VertexArray

    def _uniform(self, name: str) -> moderngl.Uniform | None:
        member = self.program.get(name, None)
        return member if isinstance(member, moderngl.Uniform) else None

    def set_uniforms(
        self,
        *,
        progress: float,
        resolution: tuple[int, int],
        params: Mapping[str, float],
    ) -> None:
        """Sets all uniforms like `Renderer.drawTransition` in the browser.

        The caller binds the textures themselves to FROM_TEXTURE_UNIT/TO_TEXTURE_UNIT.
        """
        values: dict[str, int | float | tuple[float, float]] = {
            "uFrom": FROM_TEXTURE_UNIT,
            "uTo": TO_TEXTURE_UNIT,
            "progress": min(max(float(progress), 0.0), 1.0),
            "resolution": (float(resolution[0]), float(resolution[1])),
        }
        # As in the browser: catalog parameters after the fixed uniforms.
        for name, param in params.items():
            values[name] = float(param)
        for name, value in values.items():
            uniform = self._uniform(name)
            if uniform is not None:
                uniform.value = value

    def draw(self) -> None:
        """Draws the full-screen triangle into the currently bound framebuffer."""
        self.vao.render(moderngl.TRIANGLES, vertices=FULLSCREEN_TRIANGLE_VERTICES)


@dataclass(frozen=True, slots=True, eq=False)
class TitleProgram:
    """A linked title program with an empty VAO for the full-screen triangle.

    Mirrors `Renderer.drawTitle` in TS (design.md D1-D3 of
    add-titles-and-credits): a position/zoom transform replaces the fixed
    full-screen position used for transitions, and whether the draw is
    opaque or alpha-blended is controlled by the caller's GL blend state,
    not by this program.
    """

    program: moderngl.Program
    vao: moderngl.VertexArray

    def _uniform(self, name: str) -> moderngl.Uniform | None:
        member = self.program.get(name, None)
        return member if isinstance(member, moderngl.Uniform) else None

    def set_transform(self, translate: tuple[float, float], scale: tuple[float, float]) -> None:
        """Sets `uTitle` (fixed texture unit), `uTranslate` and `uScale`."""
        values: dict[str, int | tuple[float, float]] = {
            "uTitle": TITLE_TEXTURE_UNIT,
            "uTranslate": (float(translate[0]), float(translate[1])),
            "uScale": (float(scale[0]), float(scale[1])),
        }
        for name, value in values.items():
            uniform = self._uniform(name)
            if uniform is not None:
                uniform.value = value

    def draw(self) -> None:
        """Draws the full-screen triangle into the currently bound framebuffer."""
        self.vao.render(moderngl.TRIANGLES, vertices=FULLSCREEN_TRIANGLE_VERTICES)


class ShaderLibrary:
    """Programs per transition ID, compiled lazily and cached (like `Renderer.programFor`)."""

    def __init__(self, ctx: moderngl.Context, sources: ShaderSources) -> None:
        self.ctx = ctx
        self.sources = sources
        self._programs: dict[str, TransitionProgram] = {}
        self._title_program: TitleProgram | None = None

    def precompile(self, transition_ids: Iterable[str]) -> None:
        for transition_id in transition_ids:
            self.get(transition_id)

    def get(self, transition_id: str) -> TransitionProgram:
        """Program for the transition; falls back to `fade` if the shader is missing/broken.

        Raises ShaderError if `fade` is not usable either.
        """
        cached = self._programs.get(transition_id)
        if cached is not None:
            return cached

        program: TransitionProgram | None = None
        source = self.sources.desktop_fragment_source(transition_id)
        if source is None:
            logger.warning(
                "No shader for transition %r; using %r.", transition_id, FALLBACK_TRANSITION_ID
            )
        else:
            program = self._compile(transition_id, source)

        if program is None:
            if transition_id == FALLBACK_TRANSITION_ID:
                raise ShaderError(
                    f"Fallback shader {FALLBACK_TRANSITION_ID!r} is missing or broken "
                    f"({self.sources.shaders_dir})."
                )
            program = self.get(FALLBACK_TRANSITION_ID)
        self._programs[transition_id] = program
        return program

    def title_program(self) -> TitleProgram:
        """The title program, compiled once (own vertex shader, not a transition's).

        Raises ShaderError if the title shaders are missing or fail to compile/link.
        """
        if self._title_program is None:
            self._title_program = self._compile_title()
        return self._title_program

    def _compile_title(self) -> TitleProgram:
        try:
            program = self.ctx.program(
                vertex_shader=self.sources.desktop_title_vertex_source(),
                fragment_shader=self.sources.desktop_title_fragment_source(),
            )
        except moderngl.Error as exc:
            raise ShaderError(
                f"Title shader failed to compile/link ({self.sources.shaders_dir}): {exc}"
            ) from exc
        vao = self.ctx.vertex_array(program, [])
        return TitleProgram(program=program, vao=vao)

    def _compile(self, shader_id: str, fragment_source: str) -> TransitionProgram | None:
        try:
            program = self.ctx.program(
                vertex_shader=self.sources.desktop_vertex_source(),
                fragment_shader=fragment_source,
            )
        except moderngl.Error as exc:
            logger.warning("Shader %r failed to compile/link: %s", shader_id, exc)
            return None
        vao = self.ctx.vertex_array(program, [])
        return TransitionProgram(shader_id=shader_id, program=program, vao=vao)

    def release(self) -> None:
        """Releases all programs and VAOs (the context stays with the caller)."""
        released: set[int] = set()
        for entry in self._programs.values():
            if id(entry) in released:
                continue
            released.add(id(entry))
            entry.vao.release()
            entry.program.release()
        self._programs.clear()
        if self._title_program is not None:
            self._title_program.vao.release()
            self._title_program.program.release()
            self._title_program = None
