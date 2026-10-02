from fastapi.testclient import TestClient

from mmy_backend.ffmpeg import parse_version
from mmy_backend.main import app


def test_health_reports_ok() -> None:
    res = TestClient(app).get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_parse_version_handles_release_and_git_builds() -> None:
    assert parse_version("ffmpeg version 7.1.1 Copyright (c)") == "7.1.1"
    assert parse_version("ffmpeg version n4.3.1 Copyright (c)") == "4.3.1"
    assert parse_version("garbage") is None
