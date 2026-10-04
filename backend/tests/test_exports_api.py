"""Export jobs via the API (TASK-API-006, design.md D5).

Small projects in the `small` profile so that the GL tests take only a few
seconds. Where a test needs a running export, `gate` holds the worker at the
first progress report until the test releases it.
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
    """Holds the export worker at the first progress report until `release()`."""

    def __init__(self) -> None:
        self.reached = threading.Event()
        self.released = threading.Event()

    def release(self) -> None:
        self.released.set()

    def wait_reached(self) -> None:
        assert self.reached.wait(TIMEOUT), "Export reported no progress"


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
        files.append(("files", (f"image{i}.png", buf.getvalue(), "image/png")))
    res = client.post("/api/media", files=files)
    assert res.status_code == 200, res.text
    return [r["item"]["id"] for r in res.json()["items"]]


def _save_project(client: TestClient, media_ids: list[str], duration: float = 1.0) -> None:
    slides = [
        {
            "kind": "image",
            "id": f"s{i}",
            "mediaId": media_id,
            "duration": duration,
            "transitionIn": None if i == 0 else {"transitionId": "fade", "duration": 0.5},
        }
        for i, media_id in enumerate(media_ids)
    ]
    res = client.put("/api/project", json={"schemaVersion": 3, "slides": slides, "music": []})
    assert res.status_code == 200, res.text


def _start(client: TestClient, **body: Any) -> dict[str, Any]:
    res = client.post("/api/exports", json={"profile": "small", "fileName": "My Movie", **body})
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
    raise AssertionError(f"Export {export_id} stuck in {seen}")


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


# --- Without rendering -----------------------------------------------------------


def test_empty_project_is_rejected(client: TestClient) -> None:
    res = client.post("/api/exports", json={"fileName": "My Movie"})
    assert res.status_code == 422
    assert res.json()["detail"] == {
        "code": "export.emptyProject",
        "params": {},
        "message": "Cannot export: the storyboard is empty.",
    }
    assert client.get("/api/exports").json() == {"items": []}


def test_missing_media_is_rejected(client: TestClient) -> None:
    media_ids = _upload(client, 2)
    _save_project(client, media_ids)
    # A medium disappears behind the project's back (e.g. the file index changed).
    store = client.app.state.media  # type: ignore[attr-defined]
    store._items = [item for item in store._items if item.id != media_ids[1]]
    res = client.post("/api/exports", json={"fileName": "My Movie"})
    assert res.status_code == 422
    assert res.json()["detail"] == {
        "code": "export.missingMedia",
        "params": {"count": 1, "slides": "2", "mediaIds": media_ids[1]},
        "message": "Cannot export: media missing for slide(s) 2.",
    }


CONTROL_CHARS = "The file name contains control characters."
INVALID_CHARS = (
    "The file name contains characters that are not allowed: {} "
    '(not allowed are / \\ : * ? " < > |).'
)


@pytest.mark.parametrize(
    ("file_name", "code", "params", "message"),
    [
        ("", "export.fileName.empty", {}, "The file name must not be empty."),
        ("   ", "export.fileName.empty", {}, "The file name must not be empty."),
        (".mp4", "export.fileName.empty", {}, "The file name must not be empty."),
        ("Holiday/2003", "export.fileName.invalidChars", {"chars": "/"}, INVALID_CHARS.format("/")),
        ('a"b', "export.fileName.invalidChars", {"chars": '"'}, INVALID_CHARS.format('"')),
        ("a:b", "export.fileName.invalidChars", {"chars": ":"}, INVALID_CHARS.format(":")),
        ("a*b", "export.fileName.invalidChars", {"chars": "*"}, INVALID_CHARS.format("*")),
        ("a?b", "export.fileName.invalidChars", {"chars": "?"}, INVALID_CHARS.format("?")),
        ("a<b>", "export.fileName.invalidChars", {"chars": "< >"}, INVALID_CHARS.format("< >")),
        ("a|b", "export.fileName.invalidChars", {"chars": "|"}, INVALID_CHARS.format("|")),
        ("a\\b", "export.fileName.invalidChars", {"chars": "\\"}, INVALID_CHARS.format("\\")),
        ("a\x07b", "export.fileName.controlChars", {}, CONTROL_CHARS),
        ("..", "export.fileName.invalid", {}, "The file name is invalid."),
        (
            "x" * 121,
            "export.fileName.tooLong",
            {"max": 120},
            "The file name is too long (at most 120 characters).",
        ),
    ],
)
def test_invalid_file_name_is_rejected(
    client: TestClient, file_name: str, code: str, params: dict[str, Any], message: str
) -> None:
    _save_project(client, _upload(client, 1))
    res = client.post("/api/exports", json={"profile": "small", "fileName": file_name})
    assert res.status_code == 422, res.text
    # FastAPI's native list (design.md D5): `type` is the code, `ctx` the params.
    [issue] = res.json()["detail"]
    assert issue["loc"] == ["body", "fileName"]
    assert issue["type"] == code
    assert issue["msg"] == message
    assert issue.get("ctx", {}) == params
    assert client.get("/api/exports").json() == {"items": []}


def test_file_name_rules() -> None:
    assert normalize_file_name("  My Movie  ") == "My Movie"
    assert normalize_file_name("My Movie.mp4") == "My Movie"
    assert normalize_file_name("Holiday.MP4") == "Holiday"
    assert normalize_file_name("Fest 2003 \u2013 Grüße") == "Fest 2003 \u2013 Grüße"
    assert normalize_file_name("x" * 120) == "x" * 120
    with pytest.raises(ValueError, match="not allowed: / :"):
        normalize_file_name("Holiday/2003:a")
    with pytest.raises(ValueError, match="too long"):
        normalize_file_name("x" * 121)


def test_invalid_profile_and_unknown_ids(client: TestClient) -> None:
    _save_project(client, _upload(client, 1))
    res = client.post("/api/exports", json={"profile": "huge", "fileName": "Film"})
    assert res.status_code == 422
    assert res.json()["detail"][0]["type"] == "enum"  # FastAPI's native list, unchanged
    for export_id in ("unknown", "0" * 32):
        path = f"/api/exports/{export_id}"
        expected = {
            "code": "export.notFound",
            "params": {"exportId": export_id},
            "message": "Export not found.",
        }
        for res in (client.get(path), client.get(path + "/file"), client.delete(path)):
            assert res.status_code == 404
            assert res.json() == {"detail": expected}


def test_no_gl_context_fails_with_message(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    def no_context() -> Any:
        raise RenderContextError("Export not possible: no OpenGL 3.3 context (test).")

    monkeypatch.setattr(encode, "create_render_context", no_context)
    _save_project(client, _upload(client, 1))
    job = _start(client)
    final, _ = _poll(client, job["id"], {"done", "failed", "cancelled"})
    assert final["status"] == "failed"
    assert final["errorCode"] == "export.glUnavailable"
    assert final["errorParams"] == {"reason": "Export not possible: no OpenGL 3.3 context (test)."}
    assert final["message"] == MESSAGE_GL_UNAVAILABLE
    assert final["message"].startswith("Export is not available on this system")
    assert not _export_dir(settings, job["id"]).exists()
    res = client.get(f"/api/exports/{job['id']}/file")
    assert res.status_code == 409
    assert res.json()["detail"] == {
        "code": "export.notReady",
        "params": {"status": "failed"},
        "message": "The movie is not available: the export has the status “failed”.",
    }
    # The app stays usable: a new start is possible, the failed job can be deleted.
    assert client.delete(f"/api/exports/{job['id']}").status_code == 204
    assert client.get(f"/api/exports/{job['id']}").status_code == 404


@pytest.mark.parametrize(
    ("raised", "code", "params", "message"),
    [
        (
            encode.ExportFailed("export.ffmpegMissing"),
            "export.ffmpegMissing",
            {},
            "Cannot export: FFmpeg was not found.",
        ),
        (
            encode.ExportFailed("export.ffmpegFailed", "stderr tail", returnCode=1),
            "export.ffmpegFailed",
            {"returnCode": 1},
            "FFmpeg failed with exit code 1.",
        ),
        (
            encode.ExportFailed("export.ffmpegInputClosed", frame=3, total=30),
            "export.ffmpegInputClosed",
            {"frame": 3, "total": 30},
            "FFmpeg closed its input at frame 3/30.",
        ),
        (
            encode.ExportFailed("export.renderFailed", reason="shader broken"),
            "export.renderFailed",
            {"reason": "shader broken"},
            "The export failed: shader broken",
        ),
        (
            encode.ExportFailed("export.saveFailed", reason="disk full"),
            "export.saveFailed",
            {"reason": "disk full"},
            "The export could not be saved: disk full",
        ),
        (RuntimeError("boom"), "export.unexpected", {}, "The export failed unexpectedly."),
    ],
)
def test_failed_job_carries_error_code(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    raised: Exception,
    code: str,
    params: dict[str, Any],
    message: str,
) -> None:
    def failing(*_args: Any, **_kwargs: Any) -> Path:
        raise raised

    monkeypatch.setattr("mmy_backend.exports.export_movie", failing)
    _save_project(client, _upload(client, 1))
    job = _start(client)
    final, _ = _poll(client, job["id"], {"done", "failed", "cancelled"})
    assert final["status"] == "failed"
    assert final["errorCode"] == code
    assert final["errorParams"] == params
    assert final["message"] == message
    assert "error" not in final


# --- With rendering (GL + FFmpeg) ---------------------------------------------------


@requires_gl
@slow
def test_export_runs_to_done_and_downloads(client: TestClient, settings: Settings) -> None:
    _save_project(client, _upload(client, 2))
    job = _start(client, fileName="Grüße aus Köln.mp4")
    assert job["status"] == "queued" and job["progress"] == 0.0
    assert job["profile"] == "small" and job["fileName"] == "Grüße aus Köln"
    assert job["message"] is None and job["createdAt"]
    assert "error" not in job
    assert job["errorCode"] is None and job["errorParams"] == {}

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
    # 2 x 1 s with a 0.5 s transition = 1.5 s
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

    res = client.post("/api/exports", json={"profile": "small", "fileName": "Second"})
    assert res.status_code == 409
    assert res.json()["detail"] == {
        "code": "export.busy",
        "params": {"exportId": first["id"]},
        "message": "An export is already running. Wait for it to finish or cancel it first.",
    }

    res = client.get(f"/api/exports/{first['id']}/file")
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "export.notReady"
    assert res.json()["detail"]["params"] == {"status": "running"}
    assert res.headers["content-type"] == "application/json"

    gate.release()
    final, _ = _poll(client, first["id"], {"done", "failed", "cancelled"})
    assert final["status"] == "done", final
    assert len(client.get("/api/exports").json()["items"]) == 1
    # After the end a new start is possible again.
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
    # A cancelled job can be deleted; afterwards it is unknown.
    assert client.delete(f"/api/exports/{job['id']}").status_code == 204
    assert client.get(f"/api/exports/{job['id']}").status_code == 404


@requires_gl
@slow
def test_export_uses_project_snapshot(client: TestClient, gate: Gate) -> None:
    media_ids = _upload(client, 3)
    _save_project(client, media_ids)  # 3 x 1 s, 2 x 0.5 s transition = 2.0 s
    job = _start(client)
    gate.wait_reached()

    _save_project(client, media_ids[:1])  # image removed, only 1 s left
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
