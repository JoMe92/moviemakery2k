"""Title catalog via the API and startup abort on an invalid catalog (TASK-CAT-007)."""

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from mmy_backend.config import REPO_ROOT, Settings
from mmy_backend.main import create_app
from mmy_backend.title_catalog import TitleCatalogError

CATALOG_DIR = REPO_ROOT / "packages" / "catalog"


def _broken_title_catalog(tmp_path: Path, mutate: Any) -> Settings:
    raw = json.loads((CATALOG_DIR / "titles.json").read_text(encoding="utf-8"))
    mutate(raw)
    catalog_dir = tmp_path / "catalog"
    catalog_dir.mkdir()
    (catalog_dir / "transitions.json").write_text(
        (CATALOG_DIR / "transitions.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    (catalog_dir / "titles.json").write_text(json.dumps(raw), encoding="utf-8")
    return Settings(data_dir=tmp_path / "data", catalog_dir=catalog_dir, web_dist=tmp_path / "d")


def test_title_catalog_endpoint_returns_eight_entries_in_camel_case(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        res = client.get("/api/catalog/titles")
    assert res.status_code == 200
    body = res.json()
    assert body["schemaVersion"] == 1
    assert len(body["titles"]) == 8
    for entry in body["titles"]:
        assert set(entry) == {
            "id",
            "names",
            "layout",
            "anchor",
            "fontScale",
            "phases",
            "source",
        }
    subtitle = next(t for t in body["titles"] if t["id"] == "subtitle")
    assert subtitle["names"] == {"de": "Untertitel", "en": "Subtitle"}
    assert subtitle["fontScale"] == 0.7


def test_openapi_uses_camel_case_for_titles(settings: Settings) -> None:
    schema = TestClient(create_app(settings)).get("/openapi.json").json()
    props = schema["components"]["schemas"]["Title"]["properties"]
    assert "fontScale" in props
    assert "font_scale" not in props


def test_startup_aborts_on_duplicate_title_id(tmp_path: Path) -> None:
    settings = _broken_title_catalog(
        tmp_path, lambda raw: raw["titles"][1].update(id="basic-title")
    )
    with pytest.raises(TitleCatalogError, match=r"entry #1 \(id 'basic-title'\): id: duplicate"):
        create_app(settings)


def test_startup_aborts_without_english_name(tmp_path: Path) -> None:
    settings = _broken_title_catalog(tmp_path, lambda raw: raw["titles"][2]["names"].pop("en"))
    with pytest.raises(TitleCatalogError) as exc_info:
        create_app(settings)
    message = str(exc_info.value)
    assert "entry #2 (id 'zoom-in')" in message
    assert "names.en" in message


@pytest.mark.parametrize(
    ("mutate", "fragment"),
    [
        (
            lambda raw: raw["titles"][0]["phases"]["entrance"].update(effect="spin"),
            "phases.entrance",
        ),
        (lambda raw: raw["titles"][0].update(layout="three-line"), "layout"),
        (lambda raw: raw["titles"][0].update(fontScale=1.5), "fontScale"),
        (lambda raw: raw["titles"][1]["phases"]["entrance"]["start"].update(scale=0), "scale"),
        (lambda raw: raw["titles"][0].update(extra=1), "extra"),
    ],
)
def test_schema_violations_name_the_field(tmp_path: Path, mutate: Any, fragment: str) -> None:
    with pytest.raises(TitleCatalogError, match=fragment):
        create_app(_broken_title_catalog(tmp_path, mutate))
