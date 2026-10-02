"""Headless GL context: library resolution without `find_library` subprocesses."""

import subprocess
from pathlib import Path
from typing import Any

import pytest
from conftest import requires_gl

from mmy_backend.render.context import create_render_context, resolve_egl_libraries


def test_resolve_prefers_glcontext_environment_variables(tmp_path: Path) -> None:
    environ = {
        "GLCONTEXT_LINUX_LIBGL": "/opt/gl/libGL.so.1",
        "GLCONTEXT_LINUX_LIBEGL": "/opt/gl/libEGL.so.1",
    }
    assert resolve_egl_libraries(environ, prefix=str(tmp_path)) == {
        "libgl": "/opt/gl/libGL.so.1",
        "libegl": "/opt/gl/libEGL.so.1",
    }


def test_resolve_falls_back_to_the_environment_prefix(tmp_path: Path) -> None:
    (tmp_path / "lib").mkdir()
    (tmp_path / "lib" / "libEGL.so.1").touch()
    # libGL is missing in the prefix: left out, glcontext looks it up itself.
    assert resolve_egl_libraries({}, prefix=str(tmp_path)) == {
        "libegl": str(tmp_path / "lib" / "libEGL.so.1"),
    }


@requires_gl
def test_context_creation_spawns_no_subprocess(monkeypatch: pytest.MonkeyPatch) -> None:
    """No `ldconfig`/`gcc`/`ld` from `ctypes.util.find_library` at export start."""
    spawned: list[Any] = []
    original = subprocess.Popen.__init__

    def record(self: subprocess.Popen[Any], args: Any, *rest: Any, **kwargs: Any) -> None:
        spawned.append(args)
        original(self, args, *rest, **kwargs)

    monkeypatch.setattr(subprocess.Popen, "__init__", record)
    ctx = create_render_context()
    try:
        assert ctx.version_code >= 330
    finally:
        ctx.release()
    assert spawned == []
