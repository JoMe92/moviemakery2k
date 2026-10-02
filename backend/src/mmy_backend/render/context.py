"""Headless-GL-Kontext für den Export (design.md D1).

Unter Linux (offiziell unterstützt: CI, Docker-Image, Pi) erzeugt moderngl den
Kontext über EGL ohne Display; die Pixi-Umgebung liefert dafür Mesa llvmpipe.
Unter macOS und Windows nutzt moderngl ohne Gewähr den nativen Standalone-Kontext.
Schlägt die Erstellung fehl, wird ein RenderContextError mit verständlicher
Meldung geworfen, damit der Export-Job sauber scheitert statt abzustürzen.
"""

import sys
from typing import Any

import moderngl

# Die Shader werden auf `#version 330 core` umgeschrieben (design.md D2).
REQUIRED_GL_VERSION = 330


class RenderContextError(Exception):
    """Es konnte kein OpenGL-3.3-Kontext für den Export erzeugt werden."""


def create_render_context() -> moderngl.Context:
    """Erzeugt einen headless OpenGL-3.3-Kontext (Linux: EGL, sonst nativ)."""
    kwargs: dict[str, Any] = {"standalone": True, "require": REQUIRED_GL_VERSION}
    linux = sys.platform.startswith("linux")
    if linux:
        kwargs["backend"] = "egl"
    try:
        return moderngl.create_context(**kwargs)
    except Exception as exc:  # glcontext wirft nur generische Exceptions
        hint = (
            "Erwartet wird Mesa llvmpipe über EGL aus der Pixi-Umgebung "
            "(prüfen mit `pixi run check-render-env`)."
            if linux
            else "Der Export wird offiziell nur unter Linux unterstützt."
        )
        raise RenderContextError(
            f"Export nicht möglich: kein OpenGL-{REQUIRED_GL_VERSION // 100}."
            f"{REQUIRED_GL_VERSION % 100 // 10}-Kontext ({exc}). {hint}"
        ) from exc
