import json

from fastapi.testclient import TestClient

from mmy_backend.config import Settings
from mmy_backend.main import create_app
from mmy_backend.openapi import render


def test_openapi_render_is_stable_and_complete() -> None:
    first = render()
    assert first == render()
    paths = json.loads(first)["paths"]
    for path in ("/api/health", "/api/catalog/transitions", "/api/media", "/api/project"):
        assert path in paths


def test_web_dist_is_served_when_built(settings: Settings) -> None:
    settings.web_dist.mkdir(parents=True, exist_ok=True)
    (settings.web_dist / "index.html").write_text("<!doctype html><title>mmy</title>")
    with TestClient(create_app(settings)) as client:
        assert "<title>mmy</title>" in client.get("/").text
        assert client.get("/api/health").json()["status"] == "ok"


def test_without_web_dist_root_is_not_found(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        assert client.get("/").status_code == 404
