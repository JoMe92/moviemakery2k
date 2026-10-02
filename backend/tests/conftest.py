import sys
from collections.abc import Iterator
from pathlib import Path

import moderngl
import pytest

from mmy_backend.config import REPO_ROOT, Settings
from mmy_backend.render.context import create_render_context

CATALOG_DIR = REPO_ROOT / "packages" / "catalog"

# GL-Tests des Exports: unter Linux (lokal und in CI) immer, sonst übersprungen.
requires_gl = pytest.mark.skipif(
    not sys.platform.startswith("linux"),
    reason="Headless-Export (EGL/llvmpipe) wird offiziell nur unter Linux unterstützt",
)


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Echter Katalog, temporäres Datenverzeichnis pro Test (design.md D8)."""
    return Settings(
        data_dir=tmp_path / "data",
        catalog_dir=CATALOG_DIR,
        web_dist=tmp_path / "dist",
    )


@pytest.fixture(scope="module")
def ctx() -> Iterator[moderngl.Context]:
    context = create_render_context()
    try:
        yield context
    finally:
        context.release()
