"""Access token for the LAN mode (add-mobile-delivery design.md D1, D9; TASK-API-015)."""

import dataclasses
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from mmy_backend.access import COOKIE_MAX_AGE, COOKIE_NAME
from mmy_backend.config import Settings
from mmy_backend.main import create_app

TOKEN = "s3cret-token_value"


@pytest.fixture
def lan_settings(settings: Settings) -> Settings:
    settings.web_dist.mkdir(parents=True, exist_ok=True)
    (settings.web_dist / "index.html").write_text("<!doctype html><title>mmy</title>")
    (settings.web_dist / "manifest.webmanifest").write_text('{"name": "moviemakerY2K"}')
    return dataclasses.replace(settings, access_token=TOKEN)


@pytest.fixture
def client(lan_settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(lan_settings), follow_redirects=False) as c:
        yield c


def cookie(value: str) -> dict[str, str]:
    return {"Cookie": f"{COOKIE_NAME}={value}"}


def assert_auth_required(response: Any) -> None:
    """`response`: what `TestClient` returns (httpx or httpx2, depending on Starlette)."""
    assert response.status_code == 401
    detail = response.json()["detail"]
    assert detail["code"] == "auth.required"
    assert detail["params"] == {}
    assert detail["message"]


def test_settings_read_token_from_env() -> None:
    assert Settings.from_env({"MMY_ACCESS_TOKEN": "abc"}).access_token == "abc"
    assert Settings.from_env({}).access_token is None
    assert Settings.from_env({"MMY_ACCESS_TOKEN": ""}).access_token is None


def test_without_token_setting_api_is_open(settings: Settings) -> None:
    assert settings.access_token is None
    with TestClient(create_app(settings)) as c:
        assert c.get("/api/project").status_code == 200
        assert c.get("/api/health").json()["status"] == "ok"


@pytest.mark.parametrize("path", ["/api/project", "/api/health", "/api/media", "/api"])
def test_api_without_token_is_401(client: TestClient, path: str) -> None:
    assert_auth_required(client.get(path))


def test_api_with_wrong_token_is_401(client: TestClient) -> None:
    assert_auth_required(client.get("/api/project", headers=cookie("wrong")))
    assert_auth_required(client.get("/api/project", headers={"Authorization": "Bearer wrong"}))
    assert_auth_required(client.get("/api/project", headers={"Authorization": f"Basic {TOKEN}"}))
    assert_auth_required(client.put("/api/project", json={}))


def test_api_with_cookie_or_bearer(client: TestClient) -> None:
    assert client.get("/api/project", headers=cookie(TOKEN)).status_code == 200
    bearer = client.get("/api/project", headers={"Authorization": f"Bearer {TOKEN}"})
    assert bearer.status_code == 200
    lower = client.get("/api/health", headers={"Authorization": f"bearer {TOKEN}"})
    assert lower.status_code == 200


def test_rotated_token_invalidates_old_cookie(lan_settings: Settings) -> None:
    rotated = dataclasses.replace(lan_settings, access_token="new-token")
    with TestClient(create_app(rotated)) as c:
        assert_auth_required(c.get("/api/project", headers=cookie(TOKEN)))
        assert c.get("/api/project", headers=cookie("new-token")).status_code == 200


def test_app_shell_and_manifest_without_token(client: TestClient) -> None:
    root = client.get("/")
    assert root.status_code == 200
    assert "<title>mmy</title>" in root.text
    manifest = client.get("/manifest.webmanifest")
    assert manifest.status_code == 200
    assert manifest.json()["name"] == "moviemakerY2K"


def test_token_exchange_sets_cookie_and_redirects(client: TestClient) -> None:
    response = client.get(f"/?token={TOKEN}")
    assert response.status_code == 303
    assert response.headers["location"] == "/"
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{COOKIE_NAME}={TOKEN};")
    attributes = {part.strip().lower() for part in cookie.split(";")[1:]}
    assert "httponly" in attributes
    assert "samesite=strict" in attributes
    assert "path=/" in attributes
    assert f"max-age={COOKIE_MAX_AGE}" in attributes
    assert COOKIE_MAX_AGE == 30 * 24 * 3600
    assert "secure" not in attributes
    # The client stored the cookie: the API now answers without further login.
    assert client.get("/api/project").status_code == 200


def test_token_exchange_keeps_other_query_params(client: TestClient) -> None:
    response = client.get(f"/index.html?a=1&token={TOKEN}&b=2")
    assert response.status_code == 303
    assert response.headers["location"] == "/index.html?a=1&b=2"


def test_wrong_token_sets_no_cookie(client: TestClient) -> None:
    response = client.get("/?token=wrong")
    assert response.status_code == 303
    assert response.headers["location"] == "/"
    assert "set-cookie" not in response.headers
    assert_auth_required(client.get("/api/project"))


def test_cookie_is_secure_behind_https_proxy(client: TestClient) -> None:
    response = client.get(f"/?token={TOKEN}", headers={"X-Forwarded-Proto": "https"})
    attributes = {p.strip().lower() for p in response.headers["set-cookie"].split(";")}
    assert "secure" in attributes


def test_cookie_is_secure_over_https(lan_settings: Settings) -> None:
    app = create_app(lan_settings)
    with TestClient(app, base_url="https://testserver", follow_redirects=False) as c:
        response = c.get(f"/?token={TOKEN}")
    attributes = {p.strip().lower() for p in response.headers["set-cookie"].split(";")}
    assert "secure" in attributes
