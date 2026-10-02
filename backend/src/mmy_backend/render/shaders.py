"""Shader-Lader des Exports (design.md D2): dieselben GLSL-Dateien wie die Vorschau.

Spiegelt `apps/web/src/render/shaderSource.ts` und den Programm-Teil von
`apps/web/src/render/Renderer.ts`:

- Fragmentprogramm = `prelude.glsl` + `transitions/<id>.glsl` + `epilogue.glsl`,
  jeweils getrimmt und mit Leerzeile verbunden, abschließender Zeilenumbruch.
- Vertex-Shader = `vertex.glsl` unverändert; gezeichnet wird ein
  Vollbild-Dreieck ohne Vertex-Buffer (3 Vertices, leeres VAO).
- Für den Desktop-GL-Kontext wird genau einmal die erste Zeile
  `#version 300 es` durch `#version 330 core` ersetzt; sonst nichts.
- Fehlt der Shader eines Übergangs oder lässt er sich nicht kompilieren/linken,
  wird geloggt und `fade` verwendet.
- Uniforms: `uFrom` = Textureinheit 0, `uTo` = Einheit 1, `progress` auf
  [0, 1] begrenzt, `resolution` = Ausgabegröße in Pixeln, jeder Katalogparameter
  als `uniform float` gleichen Namens; nicht vorhandene (oder vom Compiler
  entfernte) Uniforms werden wie im Browser still übergangen.
"""

import logging
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path

import moderngl

logger = logging.getLogger(__name__)

FALLBACK_TRANSITION_ID = "fade"
"""Übergang, auf den bei fehlendem oder fehlerhaftem Shader zurückgefallen wird."""

ES_HEADER = "#version 300 es"
CORE_HEADER = "#version 330 core"

FROM_TEXTURE_UNIT = 0
"""Textureinheit des Ausgangsbilds (`uFrom`)."""
TO_TEXTURE_UNIT = 1
"""Textureinheit des Zielbilds (`uTo`)."""

FULLSCREEN_TRIANGLE_VERTICES = 3

# Wie die Katalog-IDs (catalog.TransitionId); schützt zugleich vor Pfaden wie `../x`.
_TRANSITION_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

# Zeichen, die JavaScripts String.prototype.trim entfernt (WhiteSpace + LineTerminator).
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
    """Ein Shader-Quelltext verletzt den Vertrag oder das Fade-Programm ist unbrauchbar."""


def _js_trim(text: str) -> str:
    return text.strip(_JS_TRIM_CHARS)


def build_fragment_source(prelude: str, body: str, epilogue: str) -> str:
    """GLSL-ES-Fragmentprogramm, Zeichen für Zeichen wie `buildFragmentSource` in TS."""
    return f"{_js_trim(prelude)}\n\n{_js_trim(body)}\n\n{_js_trim(epilogue)}\n"


def to_desktop_glsl(source: str) -> str:
    """Ersetzt genau einmal die erste Zeile `#version 300 es` durch `#version 330 core`.

    Wirft ShaderError, wenn die Quelle nicht mit dieser Zeile beginnt oder eine
    weitere `#version`-Direktive enthält.
    """
    first_line, newline, rest = source.partition("\n")
    if first_line.rstrip("\r") != ES_HEADER or not newline:
        raise ShaderError(f"Shader does not start with the line {ES_HEADER!r}.")
    if "#version" in rest:
        raise ShaderError("Shader contains more than one #version directive.")
    return CORE_HEADER + first_line[len(ES_HEADER) :] + newline + rest


class ShaderSources:
    """Liest `packages/shaders` (Settings.shaders_dir); Dateien werden einmal gelesen."""

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
        """`vertex.glsl` roh (GLSL ES 3.00), wie `VERTEX_SOURCE` in TS."""
        return self._required("vertex.glsl")

    def body(self, transition_id: str) -> str | None:
        """Roher Übergangs-Shader `transitions/<id>.glsl`; None, wenn es ihn nicht gibt."""
        if not _TRANSITION_ID.fullmatch(transition_id):
            return None
        return self._read(self.shaders_dir / "transitions" / f"{transition_id}.glsl")

    def fragment_source(self, transition_id: str) -> str | None:
        """GLSL-ES-Fragmentprogramm wie `fragmentSourceFor` in TS; None ohne Shader."""
        body = self.body(transition_id)
        if body is None:
            return None
        return build_fragment_source(self.prelude, body, self.epilogue)

    def desktop_fragment_source(self, transition_id: str) -> str | None:
        """Fragmentprogramm mit `#version 330 core`; None ohne Shader."""
        source = self.fragment_source(transition_id)
        return None if source is None else to_desktop_glsl(source)

    def desktop_vertex_source(self) -> str:
        return to_desktop_glsl(self.vertex)


@dataclass(frozen=True, slots=True, eq=False)
class TransitionProgram:
    """Ein gelinktes Übergangsprogramm mit leerem VAO fürs Vollbild-Dreieck."""

    shader_id: str
    """Tatsächlich kompilierter Shader (bei Rückfall `fade`)."""
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
        """Setzt alle Uniforms wie `Renderer.drawTransition` im Browser.

        Die Texturen selbst bindet der Aufrufer an FROM_TEXTURE_UNIT/TO_TEXTURE_UNIT.
        """
        values: dict[str, int | float | tuple[float, float]] = {
            "uFrom": FROM_TEXTURE_UNIT,
            "uTo": TO_TEXTURE_UNIT,
            "progress": min(max(float(progress), 0.0), 1.0),
            "resolution": (float(resolution[0]), float(resolution[1])),
        }
        # Wie im Browser: Katalogparameter nach den festen Uniforms.
        for name, param in params.items():
            values[name] = float(param)
        for name, value in values.items():
            uniform = self._uniform(name)
            if uniform is not None:
                uniform.value = value

    def draw(self) -> None:
        """Zeichnet das Vollbild-Dreieck in den aktuell gebundenen Framebuffer."""
        self.vao.render(moderngl.TRIANGLES, vertices=FULLSCREEN_TRIANGLE_VERTICES)


class ShaderLibrary:
    """Programme je Übergangs-ID, lazy kompiliert und gecacht (wie `Renderer.programFor`)."""

    def __init__(self, ctx: moderngl.Context, sources: ShaderSources) -> None:
        self.ctx = ctx
        self.sources = sources
        self._programs: dict[str, TransitionProgram] = {}

    def precompile(self, transition_ids: Iterable[str]) -> None:
        for transition_id in transition_ids:
            self.get(transition_id)

    def get(self, transition_id: str) -> TransitionProgram:
        """Programm für den Übergang; fällt bei fehlendem/fehlerhaftem Shader auf `fade` zurück.

        Wirft ShaderError, wenn auch `fade` nicht nutzbar ist.
        """
        cached = self._programs.get(transition_id)
        if cached is not None:
            return cached

        program: TransitionProgram | None = None
        source = self.sources.desktop_fragment_source(transition_id)
        if source is None:
            logger.warning(
                "Kein Shader für Übergang %r; verwende %r.", transition_id, FALLBACK_TRANSITION_ID
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

    def _compile(self, shader_id: str, fragment_source: str) -> TransitionProgram | None:
        try:
            program = self.ctx.program(
                vertex_shader=self.sources.desktop_vertex_source(),
                fragment_shader=fragment_source,
            )
        except moderngl.Error as exc:
            logger.warning("Shader %r lässt sich nicht kompilieren/linken: %s", shader_id, exc)
            return None
        vao = self.ctx.vertex_array(program, [])
        return TransitionProgram(shader_id=shader_id, program=program, vao=vao)

    def release(self) -> None:
        """Gibt alle Programme und VAOs frei (der Kontext bleibt beim Aufrufer)."""
        released: set[int] = set()
        for entry in self._programs.values():
            if id(entry) in released:
                continue
            released.add(id(entry))
            entry.vao.release()
            entry.program.release()
        self._programs.clear()
