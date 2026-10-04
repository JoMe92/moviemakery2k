"""Transition catalog via the API and startup abort on an invalid catalog (TASK-API-001)."""

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from mmy_backend.catalog import CatalogError
from mmy_backend.config import REPO_ROOT, Settings
from mmy_backend.main import create_app

CATALOG_DIR = REPO_ROOT / "packages" / "catalog"

MVP_IDS = ["fade", "dissolve", "wipe-right", "circle", "pixelate", "checkerboard"]


def _broken_catalog(tmp_path: Path, mutate: Any) -> Settings:
    raw = json.loads((CATALOG_DIR / "transitions.json").read_text(encoding="utf-8"))
    mutate(raw)
    catalog_dir = tmp_path / "catalog"
    catalog_dir.mkdir()
    (catalog_dir / "transitions.json").write_text(json.dumps(raw), encoding="utf-8")
    return Settings(data_dir=tmp_path / "data", catalog_dir=catalog_dir, web_dist=tmp_path / "d")


def test_catalog_endpoint_returns_mvp_entries_first_in_camel_case(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        res = client.get("/api/catalog/transitions")
    assert res.status_code == 200
    body = res.json()
    assert body["schemaVersion"] == 1
    ids = [t["id"] for t in body["transitions"]]
    # add-transition-catalog appends new entries after the six MVP ones.
    assert ids[: len(MVP_IDS)] == MVP_IDS
    assert len(ids) > len(MVP_IDS)
    for entry in body["transitions"]:
        assert set(entry) == {"id", "names", "shader", "defaultDuration", "params", "source"}
        assert entry["source"]["kind"] in {"wmm2x-xml", "smpte"}
    checker = body["transitions"][len(MVP_IDS) - 1]
    assert checker["names"] == {"de": "Schachbrett", "en": "Checkerboard"}
    assert checker["defaultDuration"] == 1.25
    assert checker["params"] == {"squaresX": 12, "squaresY": 10}


def test_startup_creates_data_dir(settings: Settings) -> None:
    assert not settings.data_dir.exists()
    with TestClient(create_app(settings)):
        assert settings.data_dir.is_dir()


def test_openapi_uses_camel_case(settings: Settings) -> None:
    schema = TestClient(create_app(settings)).get("/openapi.json").json()
    props = schema["components"]["schemas"]["Transition"]["properties"]
    assert "defaultDuration" in props
    assert "default_duration" not in props


def test_startup_aborts_without_default_duration(tmp_path: Path) -> None:
    settings = _broken_catalog(tmp_path, lambda raw: raw["transitions"][2].pop("defaultDuration"))
    with pytest.raises(CatalogError) as exc_info:
        create_app(settings)
    message = str(exc_info.value)
    assert "entry #2 (id 'wipe-right')" in message
    assert "defaultDuration" in message


def test_startup_aborts_without_english_name(tmp_path: Path) -> None:
    settings = _broken_catalog(tmp_path, lambda raw: raw["transitions"][3]["names"].pop("en"))
    with pytest.raises(CatalogError) as exc_info:
        create_app(settings)
    message = str(exc_info.value)
    assert "entry #3 (id 'circle')" in message
    assert "names.en" in message


def test_startup_aborts_with_empty_german_name(tmp_path: Path) -> None:
    settings = _broken_catalog(tmp_path, lambda raw: raw["transitions"][0]["names"].update(de=""))
    with pytest.raises(CatalogError, match=r"entry #0 \(id 'fade'\): names\.de"):
        create_app(settings)


def test_startup_aborts_on_duplicate_id(tmp_path: Path) -> None:
    settings = _broken_catalog(tmp_path, lambda raw: raw["transitions"][4].update(id="fade"))
    with pytest.raises(CatalogError, match=r"entry #4 \(id 'fade'\): id: duplicate"):
        create_app(settings)


@pytest.mark.parametrize(
    ("mutate", "fragment"),
    [
        (lambda raw: raw["transitions"][0].update(defaultDuration=1.3), "defaultDuration"),
        (lambda raw: raw["transitions"][0].update(shader="fade.frag"), "shader"),
        (lambda raw: raw["transitions"][1]["params"].update(Bad=1), "params.Bad"),
        (lambda raw: raw["transitions"][1]["params"].update(seed=True), "params.seed"),
        (lambda raw: raw["transitions"][3]["source"].update(kind="xml"), "source.kind"),
        (lambda raw: raw["transitions"][3].update(extra=1), "extra"),
    ],
)
def test_schema_violations_name_the_field(tmp_path: Path, mutate: Any, fragment: str) -> None:
    with pytest.raises(CatalogError, match=fragment):
        create_app(_broken_catalog(tmp_path, mutate))


def test_settings_from_env(tmp_path: Path) -> None:
    env = {"MMY_DATA_DIR": str(tmp_path / "x"), "MMY_CATALOG_DIR": str(tmp_path)}
    settings = Settings.from_env(env)
    assert settings.data_dir == tmp_path / "x"
    assert settings.catalog_file == tmp_path / "transitions.json"
    assert settings.web_dist == REPO_ROOT / "apps" / "web" / "dist"
    assert Settings.from_env({}).data_dir == REPO_ROOT / "backend" / ".data"
