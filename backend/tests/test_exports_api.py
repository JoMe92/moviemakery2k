"""Export-Jobs über die API (TASK-API-006, design.md D5).

Kleine Projekte im Profil `small`, damit die GL-Tests nur wenige Sekunden
brauchen. Wo ein Test einen laufenden Export braucht, hält `gate` den Worker
beim ersten Fortschritt an, bis der Test ihn freigibt.
"""

import io
import json
import subprocess
import threading
import time
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any
from urllib.parse import quote

import pytest
from conftest import requires_gl
from fastapi.testclient import TestClient
from PIL import Image

from mmy_backend.config import Settings
from mmy_backend.exports import MESSAGE_GL_UNAVAILABLE, normalize_file_name
from mmy_backend.ffmpeg import ffprobe_binary
from mmy_backend.main import create_app
from mmy_backend.render import encode
from mmy_backend.render.context import RenderContextError

slow = pytest.mark.slow
TIMEOUT = 120.0


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


class Gate:
    """Hält den Export-Worker beim ersten Fortschritt an, bis `release()`."""

    def __init__(self) -> None:
        self.reached = threading.Event()
        self.released = threading.Event()

    def release(self) -> None:
        self.released.set()

    def wait_reached(self) -> None:
        assert self.reached.wait(TIMEOUT), "Export hat keinen Fortschritt gemeldet"


@pytest.fixture
def gate(monkeypatch: pytest.MonkeyPatch) -> Iterator[Gate]:
    state = Gate()
    real = encode.export_movie

    def gated(*args: Any, **kwargs: Any) -> Path:
        report: Callable[[float], None] | None = kwargs.get("progress")

        def progress(fraction: float) -> None:
            if not state.reached.is_set():
                state.reached.set()
                assert state.released.wait(TIMEOUT)
            if report is not None:
                report(fraction)

        kwargs["progress"] = progress
        return real(*args, **kwargs)

    monkeypatch.setattr("mmy_backend.exports.export_movie", gated)
    try:
        yield state
    finally:
        state.release()


def _upload(client: TestClient, count: int) -> list[str]:
    files = []
    for i in range(count):
        buf = io.BytesIO()
        Image.new("RGB", (64, 48), (i * 80, 40, 200 - i * 60)).save(buf, "PNG")
        files.append(("files", (f"bild{i}.png", buf.getvalue(), "image/png")))
    res = client.post("/api/media", files=files)
    assert res.status_code == 200, res.text
    return [r["item"]["id"] for r in res.json()["items"]]


def _save_project(client: TestClient, media_ids: list[str], duration: float = 1.0) -> None:
    slides = [
        {
            "id": f"s{i}",
            "mediaId": media_id,
            "duration": duration,
            "transitionIn": None if i == 0 else {"transitionId": "fade", "duration": 0.5},
        }
        for i, media_id in enumerate(media_ids)
    ]
    res = client.put("/api/project", json={"schemaVersion": 1, "slides": slides})
    assert res.status_code == 200, res.text


def _start(client: TestClient, **body: Any) -> dict[str, Any]:
    res = client.post("/api/exports", json={"profile": "small", "fileName": "Mein Film", **body})
    assert res.status_code == 202, res.text
    return dict(res.json())


def _poll(client: TestClient, export_id: str, until: set[str]) -> tuple[dict[str, Any], list[str]]:
    seen: list[str] = []
    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline:
        res = client.get(f"/api/exports/{export_id}")
        assert res.status_code == 200, res.text
        job = dict(res.json())
        if not seen or seen[-1] != job["status"]:
            seen.append(job["status"])
        if job["status"] in until:
            return job, seen
        time.sleep(0.02)
    raise AssertionError(f"Export {export_id} blieb in {seen}")


def _export_dir(settings: Settings, export_id: str) -> Path:
    return settings.data_dir / "exports" / export_id


def _duration(path: Path) -> float:
    binary = ffprobe_binary()
    assert binary is not None
    out = subprocess.run(
        [binary, "-v", "error", "-show_format", "-of", "json", str(path)],
        capture_output=True,
        check=True,
        text=True,
    ).stdout
    return float(json.loads(out)["format"]["duration"])


# --- Ohne Rendern ----------------------------------------------------------------


def test_empty_project_is_rejected(client: TestClient) -> None:
    res = client.post("/api/exports", json={"fileName": "Mein Film"})
    assert res.status_code == 422
    assert res.json()["detail"] == "Export nicht möglich: Der Bildstreifen ist leer."
    assert client.get("/api/exports").json() == {"items": []}


def test_missing_media_is_rejected(client: TestClient) -> None:
    media_ids = _upload(client, 2)
    _save_project(client, media_ids)
    # Medium verschwindet hinter dem Rücken des Projekts (z. B. Datei-Index geändert).
    store = client.app.state.media  # type: ignore[attr-defined]
    store._items = [item for item in store._items if item.id != media_ids[1]]
    res = client.post("/api/exports", json={"fileName": "Mein Film"})
    assert res.status_code == 422
    detail = res.json()["detail"]
    assert "Fehlende Medien" in detail and "Element 2" in detail and media_ids[1] in detail


@pytest.mark.parametrize(
    "file_name",
    ["", "   ", ".mp4", "Urlaub/2003", 'a"b', "a:b", "a*b", "a?b", "a<b>", "a|b", "a\\b", "a\x07b"],
)
def test_invalid_file_name_is_rejected(client: TestClient, file_name: str) -> None:
    _save_project(client, _upload(client, 1))
    res = client.post("/api/exports", json={"profile": "small", "fileName": file_name})
    assert res.status_code == 422, res.text
    [issue] = res.json()["detail"]
    assert issue["loc"] == ["body", "fileName"]
    assert issue["msg"].startswith("Feld fileName: Der Dateiname")
    assert client.get("/api/exports").json() == {"items": []}


def test_file_name_rules() -> None:
    assert normalize_file_name("  Mein Film  ") == "Mein Film"
    assert normalize_file_name("Mein Film.mp4") == "Mein Film"
    assert normalize_file_name("Urlaub.MP4") == "Urlaub"
    assert normalize_file_name("Fest 2003 \u2013 Grüße") == "Fest 2003 \u2013 Grüße"
    assert normalize_file_name("x" * 120) == "x" * 120
    with pytest.raises(ValueError, match="unerlaubte Zeichen: / :"):
        normalize_file_name("Urlaub/2003:a")
    with pytest.raises(ValueError, match="zu lang"):
        normalize_file_name("x" * 121)


def test_invalid_profile_and_unknown_ids(client: TestClient) -> None:
    _save_project(client, _upload(client, 1))
    res = client.post("/api/exports", json={"profile": "huge", "fileName": "Film"})
    assert res.status_code == 422
    for path in ("/api/exports/unbekannt", "/api/exports/" + "0" * 32):
        assert client.get(path).status_code == 404
        assert client.get(path + "/file").status_code == 404
        assert client.delete(path).status_code == 404


def test_no_gl_context_fails_with_message(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    def no_context() -> Any:
        raise RenderContextError("Export nicht möglich: kein OpenGL-3.3-Kontext (Test).")

    monkeypatch.setattr(encode, "create_render_context", no_context)
    _save_project(client, _upload(client, 1))
    job = _start(client)
    final, _ = _poll(client, job["id"], {"done", "failed", "cancelled"})
    assert final["status"] == "failed"
    assert final["error"] == MESSAGE_GL_UNAVAILABLE
    assert "auf diesem System nicht verfügbar" in final["error"]
    assert not _export_dir(settings, job["id"]).exists()
    res = client.get(f"/api/exports/{job['id']}/file")
    assert res.status_code == 409 and "failed" in res.json()["detail"]
    # Die App bleibt bedienbar: ein neuer Start ist möglich, der fehlgeschlagene Job löschbar.
    assert client.delete(f"/api/exports/{job['id']}").status_code == 204
    assert client.get(f"/api/exports/{job['id']}").status_code == 404


# --- Mit Rendern (GL + FFmpeg) ------------------------------------------------------


@requires_gl
@slow
def test_export_runs_to_done_and_downloads(client: TestClient, settings: Settings) -> None:
    _save_project(client, _upload(client, 2))
    job = _start(client, fileName="Grüße aus Köln.mp4")
    assert job["status"] == "queued" and job["progress"] == 0.0
    assert job["profile"] == "small" and job["fileName"] == "Grüße aus Köln"
    assert job["error"] is None and job["createdAt"]

    progresses: list[float] = []
    deadline = time.monotonic() + TIMEOUT
    seen: list[str] = ["queued"]
    while time.monotonic() < deadline:
        current = client.get(f"/api/exports/{job['id']}").json()
        progresses.append(current["progress"])
        if seen[-1] != current["status"]:
            seen.append(current["status"])
        if current["status"] not in ("queued", "running"):
            break
        time.sleep(0.01)
    assert seen[-1] == "done", seen
    assert seen in (["queued", "running", "done"], ["queued", "done"])
    assert progresses == sorted(progresses) and progresses[-1] == 1.0

    out = _export_dir(settings, job["id"]) / "out.mp4"
    assert out.is_file() and not (out.parent / "out.mp4.part").exists()
    res = client.get(f"/api/exports/{job['id']}/file")
    assert res.status_code == 200
    assert res.headers["content-type"] == "video/mp4"
    assert res.content[4:8] == b"ftyp"
    assert res.content == out.read_bytes()
    disposition = res.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    assert 'filename="Gruesse aus Koeln.mp4"' in disposition
    assert f"filename*=UTF-8''{quote('Grüße aus Köln.mp4', safe='')}" in disposition
    # 2 x 1 s mit 0,5-s-Übergang = 1,5 s
    assert abs(_duration(out) - 1.5) <= 1 / 30

    assert [j["id"] for j in client.get("/api/exports").json()["items"]] == [job["id"]]
    assert client.delete(f"/api/exports/{job['id']}").status_code == 204
    assert not _export_dir(settings, job["id"]).exists()
    assert client.get(f"/api/exports/{job['id']}").status_code == 404
    assert client.get(f"/api/exports/{job['id']}/file").status_code == 404


@requires_gl
@slow
def test_second_export_conflicts_and_file_before_end(client: TestClient, gate: Gate) -> None:
    _save_project(client, _upload(client, 2))
    first = _start(client)
    gate.wait_reached()

    res = client.post("/api/exports", json={"profile": "small", "fileName": "Zweiter"})
    assert res.status_code == 409
    assert "läuft bereits ein Export" in res.json()["detail"]

    res = client.get(f"/api/exports/{first['id']}/file")
    assert res.status_code == 409
    assert "running" in res.json()["detail"]
    assert res.headers["content-type"] == "application/json"

    gate.release()
    final, _ = _poll(client, first["id"], {"done", "failed", "cancelled"})
    assert final["status"] == "done", final
    assert len(client.get("/api/exports").json()["items"]) == 1
    # Nach dem Ende ist ein neuer Start wieder möglich.
    second = _start(client)
    final, _ = _poll(client, second["id"], {"done", "failed", "cancelled"})
    assert final["status"] == "done", final


@requires_gl
@slow
def test_cancel_leaves_no_partial_file(client: TestClient, settings: Settings, gate: Gate) -> None:
    _save_project(client, _upload(client, 2), duration=5.0)
    job = _start(client)
    gate.wait_reached()
    directory = _export_dir(settings, job["id"])
    assert (directory / "out.mp4.part").exists()

    release = threading.Timer(0.2, gate.release)
    release.start()
    res = client.delete(f"/api/exports/{job['id']}")
    release.join()
    assert res.status_code == 204

    current = client.get(f"/api/exports/{job['id']}").json()
    assert current["status"] == "cancelled"
    assert not directory.exists()
    assert client.get(f"/api/exports/{job['id']}/file").status_code == 409
    # Ein abgebrochener Job lässt sich löschen; danach ist er unbekannt.
    assert client.delete(f"/api/exports/{job['id']}").status_code == 204
    assert client.get(f"/api/exports/{job['id']}").status_code == 404


@requires_gl
@slow
def test_export_uses_project_snapshot(client: TestClient, gate: Gate) -> None:
    media_ids = _upload(client, 3)
    _save_project(client, media_ids)  # 3 x 1 s, 2 x 0,5 s Übergang = 2,0 s
    job = _start(client)
    gate.wait_reached()

    _save_project(client, media_ids[:1])  # Bild entfernt, nur noch 1 s
    assert len(client.get("/api/project").json()["slides"]) == 1

    gate.release()
    final, _ = _poll(client, job["id"], {"done", "failed", "cancelled"})
    assert final["status"] == "done", final
    res = client.get(f"/api/exports/{job['id']}/file")
    assert res.status_code == 200
    path = Path(client.app.state.settings.data_dir) / "exports" / job["id"] / "out.mp4"  # type: ignore[attr-defined]
    assert abs(_duration(path) - 2.0) <= 1 / 30


@requires_gl
@slow
def test_shutdown_cancels_running_export(settings: Settings, gate: Gate) -> None:
    with TestClient(create_app(settings)) as client:
        _save_project(client, _upload(client, 2), duration=5.0)
        job = _start(client)
        gate.wait_reached()
        manager = client.app.state.exports  # type: ignore[attr-defined]
        threading.Timer(0.2, gate.release).start()
    assert manager.get(job["id"]).status == "cancelled"
    assert not _export_dir(settings, job["id"]).exists()
