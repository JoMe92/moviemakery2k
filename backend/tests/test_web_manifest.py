"""Web app manifest and icons (add-mobile-delivery design.md D5; TASK-WEB-048).

Checks apps/web/public (copied unchanged into the build by Vite) against the
spec installable-app: required fields, and every icon exists in its size.
"""

import importlib.util
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from PIL import Image

from mmy_backend.config import REPO_ROOT

WEB = REPO_ROOT / "apps" / "web"
PUBLIC = WEB / "public"


def manifest() -> dict[str, Any]:
    data: dict[str, Any] = json.loads((PUBLIC / "manifest.webmanifest").read_text("utf-8"))
    return data


def theme_token(name: str) -> str:
    css = (WEB / "src" / "styles" / "theme.css").read_text("utf-8")
    match = re.search(rf"--{name}:\s*(#[0-9a-fA-F]{{6}})", css)
    assert match, name
    return match.group(1).lower()


def public_file(src: str) -> Path:
    assert src.startswith("/"), src
    return PUBLIC / src.lstrip("/")


class _Head(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: dict[str, dict[str, str | None]] = {}
        self.metas: dict[str, str | None] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "link" and values.get("rel"):
            self.links[str(values["rel"])] = values
        if tag == "meta" and values.get("name"):
            self.metas[str(values["name"])] = values.get("content")


def head() -> _Head:
    parser = _Head()
    parser.feed((WEB / "index.html").read_text("utf-8"))
    return parser


def test_manifest_fields() -> None:
    data = manifest()
    assert data["name"] == "moviemakerY2K"
    assert data["short_name"] == "mmY2K"
    assert data["display"] == "standalone"
    assert data["orientation"] == "any"
    assert data["start_url"] == "/"
    assert data["scope"] == "/"
    assert data["theme_color"].lower() == theme_token("y2k-title-mid")
    assert data["background_color"].lower() == theme_token("y2k-face")


def test_every_icon_exists_in_its_size() -> None:
    icons = manifest()["icons"]
    for icon in icons:
        path = public_file(icon["src"])
        assert path.is_file(), icon["src"]
        if icon["type"] == "image/png":
            width, height = (int(n) for n in icon["sizes"].split("x"))
            with Image.open(path) as image:
                assert image.format == "PNG"
                assert image.size == (width, height), icon["src"]
        else:
            assert icon["type"] == "image/svg+xml"
            assert path.read_text("utf-8").lstrip().startswith("<svg")
    png = {(i["sizes"], i.get("purpose", "any")) for i in icons if i["type"] == "image/png"}
    assert {("192x192", "any"), ("512x512", "any"), ("512x512", "maskable")} <= png


def test_maskable_and_apple_icons_are_opaque() -> None:
    maskable = next(i for i in manifest()["icons"] if i.get("purpose") == "maskable")
    apple = head().links["apple-touch-icon"]["href"]
    assert apple
    for src in (maskable["src"], apple):
        with Image.open(public_file(src)) as image:
            assert image.mode == "RGB", src  # full bleed, no transparent corners
    with Image.open(public_file(apple)) as image:
        assert image.size == (180, 180)


def test_index_html_links_manifest_and_apple_meta() -> None:
    parsed = head()
    assert parsed.links["manifest"]["href"] == "/manifest.webmanifest"
    assert parsed.metas["apple-mobile-web-app-capable"] == "yes"
    assert parsed.metas["apple-mobile-web-app-status-bar-style"]
    assert parsed.metas["theme-color"] == manifest()["theme_color"]


def test_svg_matches_generator() -> None:
    spec = importlib.util.spec_from_file_location(
        "gen_icons", REPO_ROOT / "scripts" / "gen_icons.py"
    )
    assert spec and spec.loader
    gen_icons = importlib.util.module_from_spec(spec)
    sys.modules["gen_icons"] = gen_icons
    spec.loader.exec_module(gen_icons)
    assert (PUBLIC / "icons" / "icon.svg").read_text("utf-8") == gen_icons.svg()
    assert {v.file for v in gen_icons.VARIANTS} <= {p.name for p in (PUBLIC / "icons").iterdir()}
