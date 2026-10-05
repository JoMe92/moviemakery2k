"""Job index `exports/index.json`: restart, atomic retention, damaged index
(design.md D9, TASK-API-011).

Without GL: `export_movie` is replaced by a stub that writes a small file, or
writes a partial file and blocks until it is cancelled.
"""

import io
import json
import shutil
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from mmy_backend.config import Settings
from mmy_backend.exports import MAX_DONE_EXPORTS, ExportManager, ExportStatus
from mmy_backend.main import create_app
from mmy_backend.render.encode import ExportCancelled
from mmy_backend.storage import write_bytes_atomic

TIMEOUT = 30.0
CONTENT = b"\x00\x00\x00\x18ftypisom"


class FakeExport:
    """Replaces `export_movie`. With `block` set it writes `out.mp4.part` and
    waits for the cancel signal, like a long-running FFmpeg."""

    def __init__(self) -> None:
        self.block = False
        self.started = threading.Event()

    def __call__(self, *args: Any, **kwargs: Any) -> Path:
        out: Path = args[3]
        out.parent.mkdir(parents=True, exist_ok=True)
        if self.block:
            part = out.with_name(out.name + ".part")
            part.write_bytes(b"half")
            self.started.set()
            cancel: threading.Event = kwargs["cancel"]
            cancel.wait(TIMEOUT)
            part.unlink(missing_ok=True)
            raise ExportCancelled()
        out.write_bytes(CONTENT)
        return out


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeExport:
    stub = FakeExport()
    monkeypatch.setattr("mmy_backend.exports.export_movie", stub)
    return stub


def _prepare(client: TestClient) -> None:
    buf = io.BytesIO()
    Image.new("RGB", (8, 6), (200, 10, 10)).save(buf, "PNG")
    res = client.post("/api/media", files=[("files", ("a.png", buf.getvalue()))])
    media_id = res.json()["items"][0]["item"]["id"]
    slide = {
        "kind": "image",
        "id": "s0",
        "mediaId": media_id,
        "duration": 1.0,
        "effectId": None,
        "title": None,
        "transitionIn": None,
    }
    res = client.put("/api/project", json={"schemaVersion": 5, "slides": [slide], "music": []})
    assert res.status_code == 200, res.text


@pytest.fixture
def client(settings: Settings, fake: FakeExport) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        _prepare(test_client)
        yield test_client


def _manager(client: TestClient) -> ExportManager:
    manager: ExportManager = client.app.state.exports  # type: ignore[attr-defined]
    return manager


def _start(client: TestClient, name: str = "Film") -> str:
    res = client.post("/api/exports", json={"profile": "small", "fileName": name})
    assert res.status_code == 202, res.text
    return str(res.json()["id"])


def _run(client: TestClient, name: str = "Film") -> dict[str, Any]:
    export_id = _start(client, name)
    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline:
        job = dict(client.get(f"/api/exports/{export_id}").json())
        if job["status"] not in ("queued", "running"):
            thread = _manager(client)._jobs[export_id].thread
            assert thread is not None
            thread.join(TIMEOUT)
            return job
        time.sleep(0.005)
    raise AssertionError("Export did not finish")


def _index(settings: Settings) -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = json.loads(
        (settings.data_dir / "exports" / "index.json").read_text()
    )
    return data


def _ids(client: TestClient) -> list[str]:
    return [j["id"] for j in client.get("/api/exports").json()["items"]]


# --- Restart ---------------------------------------------------------------------


def test_restart_keeps_done_and_drops_interrupted_export(
    settings: Settings, fake: FakeExport, tmp_path: Path
) -> None:
    exports_dir = settings.data_dir / "exports"
    crash_image = tmp_path / "crash-image"
    with TestClient(create_app(settings)) as client:
        _prepare(client)
        done = _run(client, "Grüße")
        assert done["status"] == "done"
        assert [e["id"] for e in _index(settings)] == [done["id"]]

        fake.block = True
        running_id = _start(client)
        assert fake.started.wait(TIMEOUT)
        assert (exports_dir / running_id / "out.mp4.part").is_file()
        # The disk state a killed backend would leave behind.
        shutil.copytree(exports_dir, crash_image)

    # Simulate the crash: restore the disk state from while the export was running.
    shutil.rmtree(exports_dir)
    shutil.copytree(crash_image, exports_dir)
    assert (exports_dir / running_id / "out.mp4.part").is_file()

    fake.block = False
    with TestClient(create_app(settings)) as client:
        items = client.get("/api/exports").json()["items"]
        assert [(j["id"], j["status"], j["progress"]) for j in items] == [(done["id"], "done", 1.0)]
        assert items[0]["fileName"] == "Grüße"
        assert items[0]["profile"] == "small"
        assert items[0]["createdAt"] == done["createdAt"]
        res = client.get(f"/api/exports/{done['id']}/file")
        assert res.status_code == 200
        assert res.content == CONTENT
        assert "Gruesse.mp4" in res.headers["content-disposition"]

        assert client.get(f"/api/exports/{running_id}").status_code == 404
        assert not (exports_dir / running_id).exists()
        assert sorted(p.name for p in exports_dir.iterdir()) == sorted([done["id"], "index.json"])
        assert not list(exports_dir.rglob("*.part"))
        assert [e["id"] for e in _index(settings)] == [done["id"]]

        # The loaded export takes part in retention and can be deleted.
        assert client.delete(f"/api/exports/{done['id']}").status_code == 204
        assert _index(settings) == []
        assert not (exports_dir / done["id"]).exists()


def test_graceful_shutdown_during_export_leaves_no_remains(
    settings: Settings, fake: FakeExport
) -> None:
    exports_dir = settings.data_dir / "exports"
    with TestClient(create_app(settings)) as client:
        _prepare(client)
        fake.block = True
        running_id = _start(client)
        assert fake.started.wait(TIMEOUT)
    assert not (exports_dir / running_id).exists()

    fake.block = False
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/exports").json() == {"items": []}
    assert list(exports_dir.iterdir()) == []


def test_restart_drops_index_entries_without_file_and_extra_remains(settings: Settings) -> None:
    exports_dir = settings.data_dir / "exports"
    with_file, without_file, stray = "a" * 32, "b" * 32, "c" * 32
    (exports_dir / with_file).mkdir(parents=True)
    (exports_dir / with_file / "out.mp4").write_bytes(CONTENT)
    (exports_dir / with_file / "out.mp4.part").write_bytes(b"left over")
    (exports_dir / without_file).mkdir()
    (exports_dir / without_file / "out.mp4.part").write_bytes(b"half")
    (exports_dir / stray).mkdir()
    (exports_dir / stray / "out.mp4").write_bytes(CONTENT)
    (exports_dir / ".index-tmp.json").write_text("[")
    entries = [
        {"id": i, "fileName": "Film", "profile": "high", "createdAt": f"2026-10-0{n}T10:00:00Z"}
        for n, i in enumerate((with_file, without_file), start=1)
    ]
    (exports_dir / "index.json").write_text(json.dumps(entries))

    with TestClient(create_app(settings)) as client:
        assert _ids(client) == [with_file]
        assert client.get(f"/api/exports/{with_file}/file").status_code == 200
    assert sorted(p.name for p in exports_dir.iterdir()) == sorted([with_file, "index.json"])
    assert [p.name for p in (exports_dir / with_file).iterdir()] == ["out.mp4"]
    assert [e["id"] for e in _index(settings)] == [with_file]


def test_restart_applies_retention_to_an_oversized_index(settings: Settings) -> None:
    exports_dir = settings.data_dir / "exports"
    ids = [f"{n:032x}" for n in range(1, MAX_DONE_EXPORTS + 3)]
    for export_id in ids:
        (exports_dir / export_id).mkdir(parents=True)
        (exports_dir / export_id / "out.mp4").write_bytes(CONTENT)
    entries = [
        {"id": i, "fileName": f"Film {n}", "profile": "small", "createdAt": "2026-10-01T10:00:00Z"}
        for n, i in enumerate(ids)
    ]
    (exports_dir / "index.json").write_text(json.dumps(entries))

    with TestClient(create_app(settings)) as client:
        assert _ids(client) == ids[-MAX_DONE_EXPORTS:]
    assert sorted(p.name for p in exports_dir.iterdir()) == sorted(
        [*ids[-MAX_DONE_EXPORTS:], "index.json"]
    )
    assert [e["id"] for e in _index(settings)] == ids[-MAX_DONE_EXPORTS:]


# --- Damaged index ---------------------------------------------------------------


@pytest.mark.parametrize(
    "content",
    [
        b"{not json",
        b"\xff\xfe\x00garbage",
        b'{"items": []}',
        b"",
    ],
    ids=["invalid-json", "binary", "not-a-list", "empty"],
)
def test_damaged_index_is_treated_as_empty(
    settings: Settings, content: bytes, caplog: pytest.LogCaptureFixture
) -> None:
    exports_dir = settings.data_dir / "exports"
    export_id = "d" * 32
    (exports_dir / export_id).mkdir(parents=True)
    (exports_dir / export_id / "out.mp4").write_bytes(CONTENT)
    (exports_dir / "index.json").write_bytes(content)

    with TestClient(create_app(settings)) as client:
        assert client.get("/api/exports").json() == {"items": []}
    assert [p.name for p in exports_dir.iterdir()] == ["index.json"]
    assert _index(settings) == []
    assert "Export index" in caplog.text


def test_invalid_index_entries_are_skipped(settings: Settings) -> None:
    exports_dir = settings.data_dir / "exports"
    good = "e" * 32
    (exports_dir / good).mkdir(parents=True)
    (exports_dir / good / "out.mp4").write_bytes(CONTENT)
    entries: list[object] = [
        "not an object",
        {"id": "../escape", "fileName": "x", "profile": "high", "createdAt": "2026-10-01T10:00Z"},
        {"id": "f" * 32, "fileName": "a\r\nb", "profile": "high", "createdAt": "2026-10-01T10:00Z"},
        {"id": "f" * 32, "fileName": "ok", "profile": "huge", "createdAt": "2026-10-01T10:00Z"},
        {"id": good, "fileName": "Film", "profile": "high", "createdAt": "2026-10-01T10:00:00Z"},
    ]
    (exports_dir / "index.json").write_text(json.dumps(entries))

    with TestClient(create_app(settings)) as client:
        assert _ids(client) == [good]
    assert not (exports_dir.parent / "escape").exists()
    assert [e["id"] for e in _index(settings)] == [good]


# --- Retention without intermediate state -------------------------------------------


def test_retention_never_shows_six_done_exports(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    manager = _manager(client)
    exports_dir = settings.data_dir / "exports"
    snapshots: list[tuple[int, int]] = []

    def checked_write(path: Path, payload: bytes) -> None:
        # Called with the lock held: the in-memory state is the state that
        # becomes visible together with the index.
        done = [j for j in manager._jobs.values() if j.status is ExportStatus.DONE]
        snapshots.append((len(done), len(json.loads(payload))))
        write_bytes_atomic(path, payload)

    monkeypatch.setattr("mmy_backend.exports.write_bytes_atomic", checked_write)

    stop = threading.Event()
    seen: list[int] = []

    def poll() -> None:
        while not stop.is_set():
            items = manager.list()
            seen.append(sum(1 for j in items if j.status is ExportStatus.DONE))

    poller = threading.Thread(target=poll, daemon=True)
    poller.start()
    try:
        jobs = [_run(client) for _ in range(MAX_DONE_EXPORTS + 1)]
    finally:
        stop.set()
        poller.join(TIMEOUT)

    assert all(j["status"] == "done" for j in jobs)
    assert seen and max(seen) <= MAX_DONE_EXPORTS
    assert snapshots == [(n, n) for n in range(1, MAX_DONE_EXPORTS + 1)] + [
        (MAX_DONE_EXPORTS, MAX_DONE_EXPORTS)
    ]
    expected = [j["id"] for j in jobs[1:]]
    assert _ids(client) == expected
    assert [e["id"] for e in _index(settings)] == expected
    assert sorted(p.name for p in exports_dir.iterdir()) == sorted([*expected, "index.json"])


def test_index_lists_only_done_exports(
    client: TestClient, settings: Settings, fake: FakeExport
) -> None:
    done = _run(client)
    fake.block = True
    running_id = _start(client)
    assert fake.started.wait(TIMEOUT)
    assert [e["id"] for e in _index(settings)] == [done["id"]]
    entry = _index(settings)[0]
    assert set(entry) == {"id", "fileName", "profile", "createdAt"}
    assert client.delete(f"/api/exports/{running_id}").status_code == 204
    assert client.get(f"/api/exports/{running_id}").json()["status"] == "cancelled"
    assert [e["id"] for e in _index(settings)] == [done["id"]]
