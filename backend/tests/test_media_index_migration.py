"""Startup against a media.json written by an older version (mmy-nlk, ADR 0003).

0.2.0 added the required `videoUrl` to `VideoItem` without a migration, so a
backend started against an index that already held a video died inside
`create_app` with a Pydantic `ValidationError` - before any request. The tests
therefore go through `create_app` and `GET /api/media`, not through
`_read_index_payload` alone, which is the path that actually broke.
"""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from mmy_backend.config import Settings
from mmy_backend.main import create_app
from mmy_backend.media import (
    _DERIVED_URLS,
    AudioItem,
    ImageItem,
    MediaIndexError,
    MediaStore,
    VideoItem,
)

IMAGE_ID = "0f9c1d2e3a4b5c6d7e8f90a1b2c3d4e5"
AUDIO_ID = "1a2b3c4d5e6f708192a3b4c5d6e7f809"
VIDEO_ID = "2b3c4d5e6f708192a3b4c5d6e7f809a1"

# The v0.1.0 shape: one `MediaItem` class, images only, no discriminator.
LEGACY_IMAGE: dict[str, Any] = {
    "id": IMAGE_ID,
    "filename": "holiday.jpg",
    "width": 800,
    "height": 600,
    "createdAt": "2026-10-01T10:00:00Z",
    "thumbnailUrl": f"/api/media/{IMAGE_ID}/thumbnail",
    "previewUrl": f"/api/media/{IMAGE_ID}/preview",
}

LEGACY_AUDIO: dict[str, Any] = {
    "id": AUDIO_ID,
    "kind": "audio",
    "filename": "theme.mp3",
    "duration": 42.5,
    "sampleRate": 44100,
    "channels": 2,
    "codec": "mp3",
    "createdAt": "2026-10-02T10:00:00Z",
    "audioUrl": f"/api/media/{AUDIO_ID}/audio",
    "peaksUrl": f"/api/media/{AUDIO_ID}/peaks",
}

# The pre-0.2.0 shape of a video: add-video-import wrote `posterUrl`,
# add-timeline-editing's `videoUrl` did not exist yet.
LEGACY_VIDEO: dict[str, Any] = {
    "id": VIDEO_ID,
    "kind": "video",
    "filename": "clip.mp4",
    "duration": 8.5,
    "width": 1920,
    "height": 1080,
    "codec": "h264",
    "createdAt": "2026-10-03T10:00:00Z",
    "posterUrl": f"/api/media/{VIDEO_ID}/poster",
}


def _write_index(settings: Settings, entries: list[dict[str, Any]]) -> Path:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    index = settings.data_dir / "media.json"
    index.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    return index


@pytest.fixture
def legacy_client(settings: Settings) -> Iterator[TestClient]:
    """An app started against an index in the pre-0.2.0 shape."""
    _write_index(settings, [LEGACY_IMAGE, LEGACY_AUDIO, LEGACY_VIDEO])
    with TestClient(create_app(settings)) as client:
        yield client


# --- Startup ------------------------------------------------------------------


def test_app_starts_on_a_pre_020_index(legacy_client: TestClient) -> None:
    """The regression: create_app must not raise on a video without videoUrl."""
    res = legacy_client.get("/api/media")
    assert res.status_code == 200, res.text
    assert [item["id"] for item in res.json()["items"]] == [IMAGE_ID, AUDIO_ID, VIDEO_ID]


def test_the_migrated_video_is_served_with_its_url(legacy_client: TestClient) -> None:
    video = next(i for i in legacy_client.get("/api/media").json()["items"] if i["kind"] == "video")
    assert video["videoUrl"] == f"/api/media/{VIDEO_ID}/video"
    # Everything the old entry did carry is kept unchanged.
    assert video["posterUrl"] == f"/api/media/{VIDEO_ID}/poster"
    assert (video["duration"], video["width"], video["height"]) == (8.5, 1920, 1080)


def test_an_entry_without_kind_is_still_read_as_an_image(legacy_client: TestClient) -> None:
    image = next(i for i in legacy_client.get("/api/media").json()["items"] if i["id"] == IMAGE_ID)
    assert image["kind"] == "image"
    assert image["previewUrl"] == f"/api/media/{IMAGE_ID}/preview"


def test_the_migration_is_not_written_back_until_the_next_change(settings: Settings) -> None:
    """Reading is side-effect free; the repaired shape lands on the next import."""
    index = _write_index(settings, [LEGACY_VIDEO])
    create_app(settings)
    assert json.loads(index.read_text(encoding="utf-8")) == [LEGACY_VIDEO]


# --- Idempotence and derivation ------------------------------------------------


def test_a_current_index_is_unchanged(settings: Settings) -> None:
    current = {**LEGACY_VIDEO, "videoUrl": f"/api/media/{VIDEO_ID}/video"}
    _write_index(settings, [current])
    store = MediaStore(settings.data_dir)
    item = store.get(VIDEO_ID)
    assert isinstance(item, VideoItem)
    assert item.video_url == current["videoUrl"]


def test_every_required_url_field_has_a_derivation() -> None:
    """The guard rail: a new required `*Url` field must join `_DERIVED_URLS`.

    Without this, the next field added to a media item repeats mmy-nlk - it
    validates in tests, where every entry is freshly written, and fails on the
    first installation that has older data.
    """
    for kind, model in (("image", ImageItem), ("audio", AudioItem), ("video", VideoItem)):
        required = {
            field.alias or name
            for name, field in model.model_fields.items()
            if name.endswith("_url") and field.is_required()
        }
        assert required == {alias for alias, _ in _DERIVED_URLS[kind]}, (
            f"{model.__name__} has a required URL field with no entry in _DERIVED_URLS"
        )


def test_every_derived_url_points_at_a_real_route(settings: Settings) -> None:
    """A reconstructed URL must be one the app actually serves, not a guess."""
    paths = create_app(settings).openapi()["paths"]
    for fields in _DERIVED_URLS.values():
        for _alias, path in fields:
            assert f"/api/media/{{media_id}}/{path}" in paths


# --- Unrepairable index --------------------------------------------------------


def test_an_unrepairable_index_fails_with_an_actionable_error(settings: Settings) -> None:
    """A missing field that is not derivable stays fatal, but says what is wrong."""
    broken = {k: v for k, v in LEGACY_VIDEO.items() if k != "codec"}
    _write_index(settings, [broken])
    with pytest.raises(MediaIndexError) as excinfo:
        MediaStore(settings.data_dir)
    message = str(excinfo.value)
    assert "media.json" in message
    assert "codec" in message


def test_damaged_json_fails_with_an_actionable_error(settings: Settings) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    (settings.data_dir / "media.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(MediaIndexError):
        MediaStore(settings.data_dir)
