"""Headless GL context for the export (design.md D1).

On Linux (officially supported: CI, Docker image, Pi) moderngl creates the
context via EGL without a display; the Pixi environment provides Mesa llvmpipe for it.
On macOS and Windows moderngl uses the native standalone context, without guarantee.
If creation fails, a RenderContextError with an understandable message is raised
so that the export job fails cleanly instead of crashing.
"""

import sys
from typing import Any

import moderngl

# The shaders are rewritten to `#version 330 core` (design.md D2).
REQUIRED_GL_VERSION = 330


class RenderContextError(Exception):
    """No OpenGL 3.3 context could be created for the export."""


def create_render_context() -> moderngl.Context:
    """Creates a headless OpenGL 3.3 context (Linux: EGL, otherwise native)."""
    kwargs: dict[str, Any] = {"standalone": True, "require": REQUIRED_GL_VERSION}
    linux = sys.platform.startswith("linux")
    if linux:
        kwargs["backend"] = "egl"
    try:
        return moderngl.create_context(**kwargs)
    except Exception as exc:  # glcontext only raises generic exceptions
        hint = (
            "Expected: Mesa llvmpipe via EGL from the Pixi environment "
            "(check with `pixi run check-render-env`)."
            if linux
            else "Export is officially supported on Linux only."
        )
        raise RenderContextError(
            f"Export not possible: no OpenGL {REQUIRED_GL_VERSION // 100}."
            f"{REQUIRED_GL_VERSION % 100 // 10} context ({exc}). {hint}"
        ) from exc
