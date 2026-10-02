"""GET /api/media, image delivery and DELETE with cascade (TASK-API-003)."""

import io
import shutil
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from mmy_backend.config import Settings
from mmy_backend.main import create_app

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
        "id": slide_id,
        "mediaId": media_id,
        "duration": 3.0,
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
        assert res.json() == {"project": {"schemaVersion": 1, "slides": []}}

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
            "schemaVersion": 1,
            "slides": [
                _slide("s1", a),
                _slide("s2", b, ("fade", 1.0)),
                _slide("s3", a, ("dissolve", 0.5)),
                _slide("s4", c, ("fade", 0.25)),
            ],
        }
        assert client.put("/api/project", json=project).status_code == 200

        res = client.delete(f"/api/media/{a}")
        assert res.status_code == 200, res.text
        expected = {
            "schemaVersion": 1,
            "slides": [_slide("s2", b), _slide("s4", c, ("fade", 0.25))],
        }
        assert res.json() == {"project": expected}
        assert client.get("/api/project").json() == expected
        assert [i["id"] for i in client.get("/api/media").json()["items"]] == [b, c]

        # Re-inserting the deleted ID is rejected.
        stale = {"schemaVersion": 1, "slides": [_slide("s1", a)]}
        assert client.put("/api/project", json=stale).status_code == 422

    with TestClient(create_app(settings)) as client:
        assert client.get("/api/project").json() == expected


def test_openapi_documents_media_endpoints(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    assert {"get", "post"} <= set(paths["/api/media"])
    assert (
        "image/jpeg"
        in paths["/api/media/{media_id}/thumbnail"]["get"]["responses"]["200"]["content"]
    )
    assert "404" in paths["/api/media/{media_id}/preview"]["get"]["responses"]
    delete = paths["/api/media/{media_id}"]["delete"]["responses"]
    assert {"200", "404"} <= set(delete)
    schema = delete["200"]["content"]["application/json"]["schema"]
    assert schema == {"$ref": "#/components/schemas/MediaDeleteResponse"}
