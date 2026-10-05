"""AutoMovie catalog via the API, and the startup abort on an invalid catalog or
a reference into a catalog that does not know it (TASK-CAT-008)."""

import json
import shutil
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from mmy_backend.automovie_catalog import AutoMovieCatalogError
from mmy_backend.config import REPO_ROOT, Settings
from mmy_backend.main import create_app

CATALOG_DIR = REPO_ROOT / "packages" / "catalog"


def _broken_automovie_catalog(tmp_path: Path, mutate: Any) -> Settings:
    """A full copy of the catalog directory with automovie.json mutated, so the
    three catalogs it refers to stay valid and the AutoMovie check is reached."""
    raw = json.loads((CATALOG_DIR / "automovie.json").read_text(encoding="utf-8"))
    mutate(raw)
    catalog_dir = tmp_path / "catalog"
    shutil.copytree(CATALOG_DIR, catalog_dir)
    (catalog_dir / "automovie.json").write_text(json.dumps(raw), encoding="utf-8")
    return Settings(data_dir=tmp_path / "data", catalog_dir=catalog_dir, web_dist=tmp_path / "d")


def test_automovie_endpoint_returns_the_three_styles_in_camel_case(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        res = client.get("/api/catalog/automovie")
    assert res.status_code == 200
    body = res.json()
    assert body["schemaVersion"] == 1
    assert [style["id"] for style in body["styles"]] == ["classic", "old-movie", "music-video"]
    for style in body["styles"]:
        assert set(style) == {
            "id",
            "names",
            "descriptions",
            "transitionId",
            "effectId",
            "titleStyleId",
            "requiresMusic",
        }
    music_video = next(s for s in body["styles"] if s["id"] == "music-video")
    assert music_video["names"] == {"de": "Musikvideo", "en": "Music Video"}
    assert music_video["requiresMusic"] is True


def test_openapi_uses_camel_case_for_automovie_styles(settings: Settings) -> None:
    schema = TestClient(create_app(settings)).get("/openapi.json").json()
    props = schema["components"]["schemas"]["AutoMovieStyle"]["properties"]
    assert {"transitionId", "effectId", "titleStyleId", "requiresMusic"} <= set(props)
    assert not any(key.startswith("requires_") for key in props)


def test_startup_aborts_on_duplicate_style_id(tmp_path: Path) -> None:
    settings = _broken_automovie_catalog(
        tmp_path, lambda raw: raw["styles"][1].update(id="classic")
    )
    with pytest.raises(AutoMovieCatalogError, match=r"entry #1 \(id 'classic'\): id: duplicate"):
        create_app(settings)


def test_startup_aborts_when_the_catalog_file_is_missing(tmp_path: Path) -> None:
    catalog_dir = tmp_path / "catalog"
    shutil.copytree(CATALOG_DIR, catalog_dir)
    (catalog_dir / "automovie.json").unlink()
    settings = Settings(
        data_dir=tmp_path / "data", catalog_dir=catalog_dir, web_dist=tmp_path / "d"
    )
    with pytest.raises(AutoMovieCatalogError, match="not readable"):
        create_app(settings)


@pytest.mark.parametrize(
    ("mutate", "fragment"),
    [
        (
            lambda raw: raw["styles"][0].update(transitionId="teleport"),
            r"transitionId: unknown transition 'teleport'",
        ),
        (
            lambda raw: raw["styles"][1].update(effectId="film-age-ancient"),
            r"effectId: unknown effect 'film-age-ancient'",
        ),
        (
            lambda raw: raw["styles"][2].update(titleStyleId="wobble-in"),
            r"titleStyleId: unknown title style 'wobble-in'",
        ),
    ],
)
def test_startup_aborts_on_a_reference_no_catalog_knows(
    tmp_path: Path, mutate: Any, fragment: str
) -> None:
    with pytest.raises(AutoMovieCatalogError, match=fragment):
        create_app(_broken_automovie_catalog(tmp_path, mutate))


@pytest.mark.parametrize(
    ("mutate", "fragment"),
    [
        (lambda raw: raw["styles"][0].update(requiresMusic="yes"), "requiresMusic"),
        (lambda raw: raw["styles"][0].pop("titleStyleId"), "titleStyleId"),
        (lambda raw: raw["styles"][0]["descriptions"].pop("en"), "descriptions.en"),
        (lambda raw: raw["styles"][0].update(id="Classic"), "id"),
        (lambda raw: raw["styles"][0].update(extra=1), "extra"),
    ],
)
def test_schema_violations_name_the_field(tmp_path: Path, mutate: Any, fragment: str) -> None:
    with pytest.raises(AutoMovieCatalogError, match=fragment):
        create_app(_broken_automovie_catalog(tmp_path, mutate))


def test_a_style_may_leave_the_effect_empty(tmp_path: Path) -> None:
    settings = _broken_automovie_catalog(
        tmp_path, lambda raw: raw["styles"][1].update(effectId=None)
    )
    with TestClient(create_app(settings)) as client:
        body = client.get("/api/catalog/automovie").json()
    assert all(style["effectId"] is None for style in body["styles"])
