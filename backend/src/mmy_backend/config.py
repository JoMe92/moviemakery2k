"""Konfiguration aus Umgebungsvariablen.

MMY_DATA_DIR, MMY_CATALOG_DIR, MMY_WEB_DIST und MMY_SHADERS_DIR (Export-Renderer).
"""

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

# src/mmy_backend/config.py → Repo-Wurzel liegt drei Ebenen über dem Paket.
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SHADERS_DIR = REPO_ROOT / "packages" / "shaders"


@dataclass(frozen=True, slots=True)
class Settings:
    data_dir: Path
    catalog_dir: Path
    web_dist: Path
    shaders_dir: Path = DEFAULT_SHADERS_DIR
    """packages/shaders: prelude/epilogue/vertex.glsl und transitions/<id>.glsl"""

    @property
    def catalog_file(self) -> Path:
        return self.catalog_dir / "transitions.json"

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        """Liest die Umgebung; ohne Variable gelten Pfade relativ zur Repo-Wurzel."""
        source = os.environ if env is None else env

        def path(name: str, default: Path) -> Path:
            value = source.get(name)
            return Path(value).expanduser().resolve() if value else default

        return cls(
            data_dir=path("MMY_DATA_DIR", REPO_ROOT / "backend" / ".data"),
            catalog_dir=path("MMY_CATALOG_DIR", REPO_ROOT / "packages" / "catalog"),
            web_dist=path("MMY_WEB_DIST", REPO_ROOT / "apps" / "web" / "dist"),
            shaders_dir=path("MMY_SHADERS_DIR", DEFAULT_SHADERS_DIR),
        )
