from pathlib import Path

import pytest

from mmy_backend.config import REPO_ROOT, Settings

CATALOG_DIR = REPO_ROOT / "packages" / "catalog"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Echter Katalog, temporäres Datenverzeichnis pro Test (design.md D8)."""
    return Settings(
        data_dir=tmp_path / "data",
        catalog_dir=CATALOG_DIR,
        web_dist=tmp_path / "dist",
    )
