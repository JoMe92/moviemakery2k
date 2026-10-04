"""Headless GL context for the export (design.md D1).

On Linux (officially supported: CI, Docker image, Pi) moderngl creates the
context via EGL without a display; the Pixi environment provides Mesa llvmpipe for it.
On macOS and Windows moderngl uses the native standalone context, without guarantee.
If creation fails, a RenderContextError with an understandable message is raised
so that the export job fails cleanly instead of crashing.

Without explicit library paths glcontext resolves libGL/libEGL with
`ctypes.util.find_library`, which on Linux spawns `ldconfig -p` and, when that
finds nothing, `gcc` and `ld` -- about 40 ms and four subprocesses per context
(and it fails if no compiler is installed). The paths are therefore passed
explicitly (`resolve_egl_libraries`), so glcontext skips `find_library`.
"""

import os
import sys
from pathlib import Path
from typing import Any

import moderngl

# The shaders are rewritten to `#version 330 core` (design.md D2).
REQUIRED_GL_VERSION = 330


# Environment variables glcontext itself reads; set by the Pixi activation (pixi.toml).
_LIBRARY_ENV = {"libgl": "GLCONTEXT_LINUX_LIBGL", "libegl": "GLCONTEXT_LINUX_LIBEGL"}
_LIBRARY_FILES = {"libgl": "libGL.so.1", "libegl": "libEGL.so.1"}


class RenderContextError(Exception):
    """No OpenGL 3.3 context could be created for the export."""


def resolve_egl_libraries(
    environ: dict[str, str] | None = None, prefix: str | None = None
) -> dict[str, str]:
    """Explicit libGL/libEGL paths for glcontext, so it does not call `find_library`.

    Per library: the glcontext environment variable if set, otherwise the file in
    `<prefix>/lib` (the Pixi/conda environment of the interpreter) if it exists.
    Libraries that cannot be resolved are left out; glcontext then falls back to
    its own `find_library` lookup.
    """
    env = os.environ if environ is None else environ
    lib_dir = Path(sys.prefix if prefix is None else prefix) / "lib"
    paths: dict[str, str] = {}
    for key, var in _LIBRARY_ENV.items():
        if value := env.get(var):
            paths[key] = value
        elif (candidate := lib_dir / _LIBRARY_FILES[key]).is_file():
            paths[key] = str(candidate)
    return paths


def create_render_context() -> moderngl.Context:
    """Creates a headless OpenGL 3.3 context (Linux: EGL, otherwise native)."""
    kwargs: dict[str, Any] = {"standalone": True, "require": REQUIRED_GL_VERSION}
    linux = sys.platform.startswith("linux")
    if linux:
        kwargs["backend"] = "egl"
        kwargs.update(resolve_egl_libraries())
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
