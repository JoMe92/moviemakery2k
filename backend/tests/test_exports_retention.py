"""Aufbewahrung, Aufräumen beim Start und Download-Dateiname (TASK-API-007).

Ohne GL: `export_movie` wird durch eine schnelle Attrappe ersetzt, die eine
kleine Datei schreibt bzw. fehlschlägt.
"""

import io
import time
import unicodedata
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from mmy_backend.api.exports import ascii_file_name, content_disposition
from mmy_backend.config import Settings
from mmy_backend.exports import MAX_DONE_EXPORTS, MAX_JOB_ENTRIES
from mmy_backend.main import create_app
from mmy_backend.render.encode import ExportFailed

TIMEOUT = 30.0
EN_DASH = chr(0x2013)


class FakeExport:
    """Ersetzt `export_movie`: schreibt `out.mp4` oder scheitert, je nach `fail`."""

    def __init__(self) -> None:
        self.fail = False

    def __call__(self, *args: Any, **kwargs: Any) -> Path:
        out: Path = args[3]
        if self.fail:
            raise ExportFailed("export.renderFailed", reason="dummy")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"\x00\x00\x00\x18ftypisom")
        return out


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeExport:
    stub = FakeExport()
    monkeypatch.setattr("mmy_backend.exports.export_movie", stub)
    return stub


@pytest.fixture
def client(settings: Settings, fake: FakeExport) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        buf = io.BytesIO()
        Image.new("RGB", (8, 6), (200, 10, 10)).save(buf, "PNG")
        res = test_client.post("/api/media", files=[("files", ("a.png", buf.getvalue()))])
        media_id = res.json()["items"][0]["item"]["id"]
        slide = {"id": "s0", "mediaId": media_id, "duration": 1.0, "transitionIn": None}
        res = test_client.put("/api/project", json={"schemaVersion": 1, "slides": [slide]})
        assert res.status_code == 200, res.text
        yield test_client


def _run(client: TestClient, name: str = "Film") -> dict[str, Any]:
    res = client.post("/api/exports", json={"profile": "small", "fileName": name})
    assert res.status_code == 202, res.text
    export_id = res.json()["id"]
    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline:
        job = dict(client.get(f"/api/exports/{export_id}").json())
        if job["status"] not in ("queued", "running"):
            # Aufbewahrung läuft direkt nach dem Statuswechsel im Worker.
            client.app.state.exports._jobs[export_id].thread.join(TIMEOUT)  # type: ignore[attr-defined]
            return job
        time.sleep(0.005)
    raise AssertionError("Export wurde nicht fertig")


def _ids(client: TestClient) -> list[str]:
    return [j["id"] for j in client.get("/api/exports").json()["items"]]


def test_sixth_done_export_deletes_the_oldest(client: TestClient, settings: Settings) -> None:
    exports_dir = settings.data_dir / "exports"
    jobs = [_run(client) for _ in range(MAX_DONE_EXPORTS)]
    assert all(j["status"] == "done" for j in jobs)
    assert _ids(client) == [j["id"] for j in jobs]

    sixth = _run(client)
    assert sixth["status"] == "done"
    oldest = jobs[0]["id"]
    assert _ids(client) == [j["id"] for j in jobs[1:]] + [sixth["id"]]
    assert client.get(f"/api/exports/{oldest}").status_code == 404
    assert client.get(f"/api/exports/{oldest}/file").status_code == 404
    assert not (exports_dir / oldest).exists()
    assert sorted(p.name for p in exports_dir.iterdir()) == sorted(_ids(client))
    assert client.get(f"/api/exports/{sixth['id']}/file").status_code == 200


def test_failed_exports_do_not_count_against_done(client: TestClient, fake: FakeExport) -> None:
    done = [_run(client) for _ in range(MAX_DONE_EXPORTS)]
    fake.fail = True
    failed = [_run(client) for _ in range(3)]
    assert all(j["status"] == "failed" for j in failed)
    assert _ids(client) == [j["id"] for j in done + failed]


def test_job_entries_are_bounded_dropping_oldest_failed_first(
    client: TestClient, fake: FakeExport
) -> None:
    kept_done = _run(client)
    fake.fail = True
    failed = [_run(client) for _ in range(MAX_JOB_ENTRIES + 2)]
    ids = _ids(client)
    assert len(ids) == MAX_JOB_ENTRIES
    # Der fertige Export bleibt; die ältesten fehlgeschlagenen fallen weg.
    assert ids == [kept_done["id"]] + [j["id"] for j in failed[3:]]
    assert client.get(f"/api/exports/{kept_done['id']}/file").status_code == 200


def test_startup_removes_orphaned_parts_and_old_exports(settings: Settings) -> None:
    exports_dir = settings.data_dir / "exports"
    orphan = exports_dir / ("a" * 32)
    orphan.mkdir(parents=True)
    (orphan / "out.mp4.part").write_bytes(b"halb")
    old = exports_dir / ("b" * 32)
    old.mkdir()
    (old / "out.mp4").write_bytes(b"alt")
    (exports_dir / "stray.mp4.part").write_bytes(b"x")
    keep = settings.data_dir / "project.json.unrelated"
    keep.write_text("bleibt")

    with TestClient(create_app(settings)) as client:
        assert exports_dir.is_dir() and list(exports_dir.iterdir()) == []
        assert client.get("/api/exports").json() == {"items": []}
    assert keep.read_text() == "bleibt"


def test_startup_without_exports_dir(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/exports").json() == {"items": []}


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Grüße aus Köln", "Gruesse aus Koeln"),
        ("ÄÖÜ äöü ß", "AeOeUe aeoeue ss"),
        (unicodedata.normalize("NFD", "Müller"), "Mueller"),
        ("Café Crème", "Cafe Creme"),
        (f"Fest {EN_DASH} 2003", "Fest _ 2003"),
        ("東京", "__"),
        ("Mein Film", "Mein Film"),
    ],
)
def test_ascii_file_name(name: str, expected: str) -> None:
    assert ascii_file_name(name) == expected


def test_content_disposition_keeps_exact_utf8_name() -> None:
    assert content_disposition("Grüße aus Köln") == (
        'attachment; filename="Gruesse aus Koeln.mp4"; '
        "filename*=UTF-8''Gr%C3%BC%C3%9Fe%20aus%20K%C3%B6ln.mp4"
    )
    assert content_disposition("   ").startswith('attachment; filename="Film.mp4";')
