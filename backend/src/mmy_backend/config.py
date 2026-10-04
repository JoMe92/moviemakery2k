"""Configuration from environment variables.

MMY_DATA_DIR, MMY_CATALOG_DIR, MMY_WEB_DIST, MMY_SHADERS_DIR and MMY_FONTS_DIR
(export renderer), and MMY_ACCESS_TOKEN (LAN mode; unset means no access protection).
"""

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

# src/mmy_backend/config.py → the repo root is three levels above the package.
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SHADERS_DIR = REPO_ROOT / "packages" / "shaders"
DEFAULT_FONTS_DIR = REPO_ROOT / "packages" / "fonts"
TITLE_FONT_FILE = "LiberationSans-Regular.ttf"
"""Bundled title font (design.md D1 of add-titles-and-credits), same file as the web renderer."""


@dataclass(frozen=True, slots=True)
class Settings:
    data_dir: Path
    catalog_dir: Path
    web_dist: Path
    shaders_dir: Path = DEFAULT_SHADERS_DIR
    """packages/shaders: prelude/epilogue/vertex.glsl and transitions/<id>.glsl"""
    fonts_dir: Path = DEFAULT_FONTS_DIR
    """packages/fonts: the bundled title font."""
    access_token: str | None = None
    """LAN mode: token required for /api/ (`mmy_backend.access`); None disables the check."""

    @property
    def catalog_file(self) -> Path:
        return self.catalog_dir / "transitions.json"

    @property
    def effect_catalog_file(self) -> Path:
        return self.catalog_dir / "effects.json"

    @property
    def title_catalog_file(self) -> Path:
        return self.catalog_dir / "titles.json"

    @property
    def title_font_file(self) -> Path:
        return self.fonts_dir / TITLE_FONT_FILE

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        """Reads the environment; without a variable, paths relative to the repo root apply."""
        source = os.environ if env is None else env

        def path(name: str, default: Path) -> Path:
            value = source.get(name)
            return Path(value).expanduser().resolve() if value else default

        return cls(
            data_dir=path("MMY_DATA_DIR", REPO_ROOT / "backend" / ".data"),
            catalog_dir=path("MMY_CATALOG_DIR", REPO_ROOT / "packages" / "catalog"),
            web_dist=path("MMY_WEB_DIST", REPO_ROOT / "apps" / "web" / "dist"),
            shaders_dir=path("MMY_SHADERS_DIR", DEFAULT_SHADERS_DIR),
            fonts_dir=path("MMY_FONTS_DIR", DEFAULT_FONTS_DIR),
            access_token=source.get("MMY_ACCESS_TOKEN") or None,
        )
