"""GET /api/media, image delivery and DELETE with cascade (TASK-API-003)."""

import io
import shutil
import threading
import time
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from mmy_backend.config import Settings
from mmy_backend.main import create_app
from mmy_backend.media import MediaStore
from mmy_backend.render.encode import ExportCancelled

IMMUTABLE = "public, max-age=31536000, immutable"


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def _png(size: tuple[int, int], shade: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (shade, 10, 10)).save(buf, "PNG")
    return buf.getvalue()


def _upload(client: TestClient, names: list[str]) -> list[str]:
    files = [("files", (n, _png((40 + i, 30), i * 40), "image/png")) for i, n in enumerate(names)]
    res = client.post("/api/media", files=files)
    assert res.status_code == 200, res.text
    return [r["item"]["id"] for r in res.json()["items"]]


def _slide(
    slide_id: str, media_id: str, transition: tuple[str, float] | None = None
) -> dict[str, Any]:
    return {
        "kind": "image",
        "id": slide_id,
        "mediaId": media_id,
        "duration": 3.0,
        "effectId": None,
        "title": None,
        "transitionIn": (
            None
            if transition is None
            else {"transitionId": transition[0], "duration": transition[1]}
        ),
    }


# --- List ---------------------------------------------------------------------


def test_list_is_empty_initially(client: TestClient) -> None:
    res = client.get("/api/media")
    assert res.status_code == 200
    assert res.json() == {"items": []}


def test_list_keeps_import_order_across_uploads(client: TestClient) -> None:
    first = _upload(client, ["c.png", "a.png"])
    second = _upload(client, ["b.png"])

    res = client.get("/api/media")
    assert res.status_code == 200
    items = res.json()["items"]
    assert [i["id"] for i in items] == [*first, *second]
    assert [i["filename"] for i in items] == ["c.png", "a.png", "b.png"]
    assert items[0]["thumbnailUrl"] == f"/api/media/{first[0]}/thumbnail"
    assert items[0]["previewUrl"] == f"/api/media/{first[0]}/preview"


# --- Delivery -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("kind", "filename"), [("thumbnail", "thumb.jpg"), ("preview", "preview.jpg")]
)
def test_derived_images_are_served_immutable(
    client: TestClient, settings: Settings, kind: str, filename: str
) -> None:
    [media_id] = _upload(client, ["x.png"])

    res = client.get(f"/api/media/{media_id}/{kind}")
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/jpeg"
    assert res.headers["cache-control"] == IMMUTABLE
    assert res.content == (settings.data_dir / "media" / media_id / filename).read_bytes()
    with Image.open(io.BytesIO(res.content)) as image:
        assert image.format == "JPEG"


@pytest.mark.parametrize("kind", ["thumbnail", "preview"])
@pytest.mark.parametrize(
    "media_id",
    [
        "0" * 32,  # valid format, unknown
        "ABCDEF" + "0" * 26,  # upper case
        "abc",  # too short
        "..",  # path trick
        "%2e%2e",  # encoded path trick
        "g" * 32,  # not hex
    ],
)
def test_unknown_or_malformed_id_is_404(client: TestClient, kind: str, media_id: str) -> None:
    _upload(client, ["x.png"])
    res = client.get(f"/api/media/{media_id}/{kind}")
    assert res.status_code == 404
    if media_id != "..":  # The client normalises ".." away; then the router's 404 applies.
        detail = res.json()["detail"]
        assert detail["code"] == "media.notFound"
        assert detail["message"] == "Media item not found."
        assert set(detail["params"]) == {"mediaId"}


def test_missing_derived_file_is_404(client: TestClient, settings: Settings) -> None:
    [media_id] = _upload(client, ["x.png"])
    (settings.data_dir / "media" / media_id / "thumb.jpg").unlink()
    res = client.get(f"/api/media/{media_id}/thumbnail")
    assert res.status_code == 404
    assert res.json()["detail"]["code"] == "media.notFound"
    assert res.json()["detail"]["params"] == {"mediaId": media_id}
    assert client.get(f"/api/media/{media_id}/preview").status_code == 200


# --- Delete -------------------------------------------------------------------


def test_delete_removes_files_and_index_entry_persistently(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        keep, gone = _upload(client, ["keep.png", "gone.png"])
        res = client.delete(f"/api/media/{gone}")
        assert res.status_code == 200, res.text
        assert res.json() == {
            "project": {
                "schemaVersion": 6,
                "slides": [],
                "music": [],
                "narration": [],
                "clipAudioBalance": 50,
            }
        }

        assert not (settings.data_dir / "media" / gone).exists()
        assert (settings.data_dir / "media" / keep).is_dir()
        assert [i["id"] for i in client.get("/api/media").json()["items"]] == [keep]
        assert client.get(f"/api/media/{gone}/thumbnail").status_code == 404

    with TestClient(create_app(settings)) as client:
        assert [i["id"] for i in client.get("/api/media").json()["items"]] == [keep]
        assert client.delete(f"/api/media/{gone}").status_code == 404


def test_delete_tolerates_already_missing_directory(client: TestClient, settings: Settings) -> None:
    [media_id] = _upload(client, ["x.png"])
    shutil.rmtree(settings.data_dir / "media" / media_id)
    assert client.delete(f"/api/media/{media_id}").status_code == 200
    assert client.get("/api/media").json() == {"items": []}


@pytest.mark.parametrize("media_id", ["0" * 32, "abc", "..", "G" * 32])
def test_delete_unknown_or_malformed_is_404(client: TestClient, media_id: str) -> None:
    [kept] = _upload(client, ["x.png"])
    res = client.delete(f"/api/media/{media_id}")
    assert res.status_code == 404
    if media_id != "..":  # The client normalises ".." away; then the router's 404 applies.
        assert res.json() == {
            "detail": {
                "code": "media.notFound",
                "params": {"mediaId": media_id},
                "message": "Media item not found.",
            }
        }
    assert [i["id"] for i in client.get("/api/media").json()["items"]] == [kept]


def test_delete_cascades_into_project(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        a, b, c = _upload(client, ["a.png", "b.png", "c.png"])
        project = {
            "schemaVersion": 6,
            "slides": [
                _slide("s1", a),
                _slide("s2", b, ("fade", 1.0)),
                _slide("s3", a, ("dissolve", 0.5)),
                _slide("s4", c, ("fade", 0.25)),
            ],
            "music": [],
            "narration": [],
            "clipAudioBalance": 50,
        }
        assert client.put("/api/project", json=project).status_code == 200

        res = client.delete(f"/api/media/{a}")
        assert res.status_code == 200, res.text
        expected = {
            "schemaVersion": 6,
            "slides": [_slide("s2", b), _slide("s4", c, ("fade", 0.25))],
            "music": [],
            "narration": [],
            "clipAudioBalance": 50,
        }
        assert res.json() == {"project": expected}
        assert client.get("/api/project").json() == expected
        assert [i["id"] for i in client.get("/api/media").json()["items"]] == [b, c]

        # Re-inserting the deleted ID is rejected.
        stale = {
            "schemaVersion": 6,
            "slides": [_slide("s1", a)],
            "music": [],
            "narration": [],
            "clipAudioBalance": 50,
        }
        assert client.put("/api/project", json=stale).status_code == 422

    with TestClient(create_app(settings)) as client:
        assert client.get("/api/project").json() == expected


# --- Delete while exporting (design.md D5, TASK-API-010) ------------------------

TIMEOUT = 30.0


class FakeExport:
    """Replaces `export_movie` without GL: runs until `release()` (then writes the
    file) or until the export is cancelled."""

    def __init__(self) -> None:
        self.running = threading.Event()
        self.released = threading.Event()

    def release(self) -> None:
        self.released.set()

    def __call__(self, *args: Any, **kwargs: Any) -> Path:
        output: Path = args[3]
        cancel: threading.Event = kwargs["cancel"]
        self.running.set()
        deadline = time.monotonic() + TIMEOUT
        while not self.released.wait(0.01):
            if cancel.is_set():
                raise ExportCancelled
            assert time.monotonic() < deadline, "test never released the export"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(b"fake mp4")
        return output


@pytest.fixture
def fake_export(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeExport]:
    fake = FakeExport()
    monkeypatch.setattr("mmy_backend.exports.export_movie", fake)
    try:
        yield fake
    finally:
        fake.release()


def _wait_status(client: TestClient, export_id: str, wanted: str) -> dict[str, Any]:
    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline:
        job = dict(client.get(f"/api/exports/{export_id}").json())
        if job["status"] == wanted:
            return job
        time.sleep(0.02)
    raise AssertionError(f"export {export_id} did not reach {wanted}")


def test_delete_is_rejected_while_an_export_uses_the_medium(
    client: TestClient, settings: Settings, fake_export: FakeExport
) -> None:
    used, unused = _upload(client, ["used.png", "unused.png"])
    project = {
        "schemaVersion": 6,
        "slides": [_slide("s1", used), _slide("s2", used)],
        "music": [],
        "narration": [],
        "clipAudioBalance": 50,
    }
    assert client.put("/api/project", json=project).status_code == 200
    res = client.post("/api/exports", json={"profile": "small", "fileName": "Movie"})
    assert res.status_code == 202, res.text
    export_id = res.json()["id"]
    assert fake_export.running.wait(TIMEOUT)
    running = _wait_status(client, export_id, "running")

    res = client.delete(f"/api/media/{used}")
    assert res.status_code == 409, res.text
    assert res.json() == {
        "detail": {
            "code": "media.inUseByExport",
            "params": {"mediaId": used, "exportId": export_id},
            "message": (
                "The medium cannot be deleted while it is being exported. "
                "Wait for the export to finish or cancel it first."
            ),
        }
    }
    # Medium, project and export are unchanged.
    assert [i["id"] for i in client.get("/api/media").json()["items"]] == [used, unused]
    assert (settings.data_dir / "media" / used).is_dir()
    assert client.get(f"/api/media/{used}/preview").status_code == 200
    assert client.get("/api/project").json() == project
    assert client.get(f"/api/exports/{export_id}").json() == running

    # The snapshot counts, not the current project: still rejected after the
    # medium left the storyboard.
    assert (
        client.put(
            "/api/project",
            json={
                "schemaVersion": 6,
                "slides": [],
                "music": [],
                "narration": [],
                "clipAudioBalance": 50,
            },
        ).status_code
        == 200
    )
    assert client.delete(f"/api/media/{used}").status_code == 409

    # A medium the export does not use can be deleted.
    assert client.delete(f"/api/media/{unused}").status_code == 200

    fake_export.release()
    _wait_status(client, export_id, "done")
    res = client.delete(f"/api/media/{used}")
    assert res.status_code == 200, res.text
    assert client.get("/api/media").json() == {"items": []}
    assert not (settings.data_dir / "media" / used).exists()
    # The finished movie is not affected by deleting its source.
    assert client.get(f"/api/exports/{export_id}/file").content == b"fake mp4"


def test_delete_is_allowed_after_the_export_was_cancelled(
    client: TestClient, fake_export: FakeExport
) -> None:
    [media_id] = _upload(client, ["x.png"])
    project = {
        "schemaVersion": 6,
        "slides": [_slide("s1", media_id)],
        "music": [],
        "narration": [],
        "clipAudioBalance": 50,
    }
    assert client.put("/api/project", json=project).status_code == 200
    res = client.post("/api/exports", json={"profile": "small", "fileName": "Movie"})
    assert res.status_code == 202, res.text
    export_id = res.json()["id"]
    assert fake_export.running.wait(TIMEOUT)
    assert client.delete(f"/api/media/{media_id}").status_code == 409

    assert client.delete(f"/api/exports/{export_id}").status_code == 204
    assert client.get(f"/api/exports/{export_id}").json()["status"] == "cancelled"
    assert client.delete(f"/api/media/{media_id}").status_code == 200


class _BlockedIndexWrite:
    """Patches `MediaStore._write_index` so that the next write blocks until
    `release()`; `entered` is set once the write has started (in a worker thread,
    with the event loop free to serve other requests)."""

    def __init__(self, store: MediaStore, monkeypatch: pytest.MonkeyPatch) -> None:
        self.entered = threading.Event()
        self.released = threading.Event()
        original = store._write_index

        def blocking(items: Any) -> None:
            if not self.entered.is_set():
                self.entered.set()
                assert self.released.wait(TIMEOUT), "test never released the index write"
            original(items)

        monkeypatch.setattr(store, "_write_index", blocking)

    def release(self) -> None:
        self.released.set()


def _in_thread(call: Callable[[], Any]) -> tuple[threading.Thread, list[Any]]:
    result: list[Any] = []
    thread = threading.Thread(target=lambda: result.append(call()), daemon=True)
    thread.start()
    return thread, result


def test_export_started_while_the_delete_writes_the_index_does_not_see_the_medium(
    client: TestClient,
    settings: Settings,
    fake_export: FakeExport,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Race (mmy-z9f): DELETE passed the in-use check and awaits the index write;
    a POST /api/exports in that window must not snapshot the medium."""
    [media_id] = _upload(client, ["x.png"])
    project = {
        "schemaVersion": 6,
        "slides": [_slide("s1", media_id)],
        "music": [],
        "narration": [],
        "clipAudioBalance": 50,
    }
    assert client.put("/api/project", json=project).status_code == 200
    store: MediaStore = cast(Any, client.app).state.media
    blocked = _BlockedIndexWrite(store, monkeypatch)

    delete_thread, delete_result = _in_thread(lambda: client.delete(f"/api/media/{media_id}"))
    assert blocked.entered.wait(TIMEOUT)
    # The delete hangs in the index write; the export start runs meanwhile.
    res = client.post("/api/exports", json={"profile": "small", "fileName": "Movie"})
    assert res.status_code == 422, res.text
    assert res.json()["detail"]["code"] == "export.missingMedia"
    blocked.release()
    delete_thread.join(TIMEOUT)

    assert delete_result[0].status_code == 200, delete_result[0].text
    assert client.get("/api/media").json() == {"items": []}
    assert not (settings.data_dir / "media" / media_id).exists()
    assert client.get("/api/exports").json() == {"items": []}
    assert not fake_export.running.is_set()


def test_delete_waiting_for_the_store_lock_rechecks_a_newly_started_export(
    client: TestClient,
    settings: Settings,
    fake_export: FakeExport,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Race (mmy-z9f), other order: the DELETE waits for the media store lock
    (held by an upload) while an export starts with the medium; the delete must
    then be rejected instead of removing a medium in the running snapshot."""
    [media_id] = _upload(client, ["x.png"])
    project = {
        "schemaVersion": 6,
        "slides": [_slide("s1", media_id)],
        "music": [],
        "narration": [],
        "clipAudioBalance": 50,
    }
    assert client.put("/api/project", json=project).status_code == 200
    store: MediaStore = cast(Any, client.app).state.media
    blocked = _BlockedIndexWrite(store, monkeypatch)

    upload_thread, _ = _in_thread(lambda: _upload(client, ["y.png"]))
    assert blocked.entered.wait(TIMEOUT)  # the upload now holds the store lock

    remove_entered = threading.Event()
    original_remove = store.remove

    async def tracking_remove(*args: Any, **kwargs: Any) -> bool:
        # Set right before remove() blocks on the lock (no await in between).
        remove_entered.set()
        return await original_remove(*args, **kwargs)

    monkeypatch.setattr(store, "remove", tracking_remove)
    delete_thread, delete_result = _in_thread(lambda: client.delete(f"/api/media/{media_id}"))
    assert remove_entered.wait(TIMEOUT)

    res = client.post("/api/exports", json={"profile": "small", "fileName": "Movie"})
    assert res.status_code == 202, res.text
    export_id = res.json()["id"]
    blocked.release()
    upload_thread.join(TIMEOUT)
    delete_thread.join(TIMEOUT)

    assert delete_result[0].status_code == 409, delete_result[0].text
    assert delete_result[0].json()["detail"]["params"] == {
        "mediaId": media_id,
        "exportId": export_id,
    }
    assert media_id in [i["id"] for i in client.get("/api/media").json()["items"]]
    assert (settings.data_dir / "media" / media_id).is_dir()
    assert client.get("/api/project").json() == project


def test_openapi_documents_media_endpoints(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    assert {"get", "post"} <= set(paths["/api/media"])
    assert (
        "image/jpeg"
        in paths["/api/media/{media_id}/thumbnail"]["get"]["responses"]["200"]["content"]
    )
    assert "404" in paths["/api/media/{media_id}/preview"]["get"]["responses"]
    delete = paths["/api/media/{media_id}"]["delete"]["responses"]
    assert {"200", "404", "409"} <= set(delete)
    schema = delete["200"]["content"]["application/json"]["schema"]
    assert schema == {"$ref": "#/components/schemas/MediaDeleteResponse"}
