"""Project version 2: music track, migration from version 1, reference checks
against kind and duration, cascade on delete (TASK-API-014, add-music-track D3)."""

import asyncio
import io
import json
import math
import struct
import threading
import time
import wave
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from mmy_backend.config import Settings
from mmy_backend.main import create_app
from mmy_backend.project import (
    MAX_MUSIC_CLIPS,
    ImageSlide,
    MusicClip,
    Project,
    ProjectStore,
    migrate_project_data,
    remove_media_slides,
)
from mmy_backend.render.encode import ExportCancelled

AUDIO_SECONDS = 3.0
TIMEOUT = 30.0


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def _png(shade: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 6), (shade, 10, 10)).save(buf, "PNG")
    return buf.getvalue()


def _wav(seconds: float = AUDIO_SECONDS, rate: int = 8000) -> bytes:
    """Mono 16-bit sine tone; its duration is exact (no encoder padding)."""
    frames = int(seconds * rate)
    samples = (int(8000 * math.sin(2 * math.pi * 440 * i / rate)) for i in range(frames))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(b"".join(struct.pack("<h", s) for s in samples))
    return buf.getvalue()


def _upload(client: TestClient, files: list[tuple[str, bytes]]) -> list[str]:
    res = client.post(
        "/api/media",
        files=[("files", (name, data, "application/octet-stream")) for name, data in files],
    )
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    assert all("item" in r for r in items), items
    return [r["item"]["id"] for r in items]


def _media(client: TestClient) -> tuple[list[str], list[str]]:
    """Two images and two audio files (3 s each)."""
    ids = _upload(
        client,
        [("a.png", _png(10)), ("b.png", _png(90)), ("one.wav", _wav()), ("two.wav", _wav())],
    )
    return ids[:2], ids[2:]


def _slide(slide_id: str, media_id: str) -> dict[str, Any]:
    return {
        "kind": "image",
        "id": slide_id,
        "mediaId": media_id,
        "duration": 3.0,
        "effectId": None,
        "title": None,
        "transitionIn": None,
    }


def _clip(clip_id: str, media_id: str, **fields: Any) -> dict[str, Any]:
    clip = {
        "id": clip_id,
        "mediaId": media_id,
        "trimStart": 0,
        "trimEnd": None,
        "volume": 1,
        "fadeIn": False,
        "fadeOut": False,
    }
    clip.update(fields)
    return clip


def _project(images: list[str], audio: list[str]) -> dict[str, Any]:
    return {
        "schemaVersion": 5,
        "slides": [_slide("s1", images[0]), _slide("s2", images[1])],
        "music": [
            _clip("m1", audio[0], trimStart=0.5, trimEnd=2.5, volume=0.5, fadeIn=True),
            _clip("m2", audio[1], fadeOut=True),
            _clip("m3", audio[0], trimStart=1, volume=2),
        ],
    }


# --- Save and load --------------------------------------------------------------------


def test_put_then_get_roundtrip_with_music(client: TestClient, settings: Settings) -> None:
    images, audio = _media(client)
    project = _project(images, audio)
    res = client.put("/api/project", json=project)
    assert res.status_code == 200, res.text
    expected = json.loads(json.dumps(project))
    for clip in expected["music"]:  # numbers come back as floats
        clip["trimStart"] = float(clip["trimStart"])
        clip["volume"] = float(clip["volume"])
    assert res.json() == expected
    assert client.get("/api/project").json() == expected
    assert json.loads((settings.data_dir / "project.json").read_text()) == expected


def test_valid_edges_are_accepted(client: TestClient) -> None:
    images, audio = _media(client)
    project = _project(images, audio)
    project["music"] = [
        _clip("end", audio[0], trimEnd=AUDIO_SECONDS),  # end exactly at the file end
        _clip("short", audio[0], trimStart=1, trimEnd=1.5),  # exactly 0.5 s
        _clip("tail", audio[0], trimStart=AUDIO_SECONDS - 0.5),  # null end, 0.5 s left
        _clip("mute", audio[1], volume=0),
    ]
    assert client.put("/api/project", json=project).status_code == 200


def test_max_music_clips_are_accepted(client: TestClient) -> None:
    images, audio = _media(client)
    project = _project(images, audio)
    project["music"] = [_clip(f"m{i}", audio[i % 2]) for i in range(MAX_MUSIC_CLIPS)]
    assert client.put("/api/project", json=project).status_code == 200


# --- Migration from version 1 and version 2 ---------------------------------------------


def test_version_1_file_loads_with_empty_music_and_saves_as_current_version(
    settings: Settings,
) -> None:
    with TestClient(create_app(settings)) as client:
        images, audio = _media(client)
    # A version-1 slide has no `kind` either; the migration adds it on the way to version 3.
    v1_slides: list[dict[str, Any]] = [
        _slide("s1", images[0]),
        {**_slide("s2", images[1]), "transitionIn": {"transitionId": "fade", "duration": 1}},
    ]
    for slide in v1_slides:
        del slide["kind"]
    v1 = {"schemaVersion": 1, "slides": v1_slides}
    project_file = settings.data_dir / "project.json"
    project_file.write_text(json.dumps(v1))

    with TestClient(create_app(settings)) as client:
        loaded = client.get("/api/project").json()
        assert loaded == {
            "schemaVersion": 5,
            "slides": [
                _slide("s1", images[0]),
                {
                    **_slide("s2", images[1]),
                    "transitionIn": {"transitionId": "fade", "duration": 1.0},
                },
            ],
            "music": [],
        }
        # Loading alone does not rewrite the file (and keeps no backup).
        assert json.loads(project_file.read_text()) == v1
        assert not list(settings.data_dir.glob("project.json.corrupt-*"))

        loaded["music"] = [_clip("m1", audio[0])]
        assert client.put("/api/project", json=loaded).status_code == 200

    on_disk = json.loads(project_file.read_text())
    assert on_disk["schemaVersion"] == 5
    assert [c["id"] for c in on_disk["music"]] == ["m1"]
    assert ProjectStore(settings.data_dir).get().model_dump(mode="json") == on_disk


def test_version_1_file_cascade_writes_current_version(settings: Settings) -> None:
    settings.data_dir.mkdir(parents=True)
    slide = _slide("s1", "a" * 32)
    del slide["kind"]
    (settings.data_dir / "project.json").write_text(
        json.dumps({"schemaVersion": 1, "slides": [slide]})
    )
    store = ProjectStore(settings.data_dir)
    asyncio.run(store.remove_media("a" * 32))
    assert json.loads((settings.data_dir / "project.json").read_text()) == {
        "schemaVersion": 5,
        "slides": [],
        "music": [],
    }


def test_version_2_file_loads_slides_as_image_and_saves_as_current_version(
    settings: Settings,
) -> None:
    with TestClient(create_app(settings)) as client:
        images, _audio = _media(client)
    v2_slide = _slide("s1", images[0])
    del v2_slide["kind"]
    v2 = {"schemaVersion": 2, "slides": [v2_slide], "music": []}
    project_file = settings.data_dir / "project.json"
    project_file.write_text(json.dumps(v2))

    with TestClient(create_app(settings)) as client:
        loaded = client.get("/api/project").json()
        assert loaded == {"schemaVersion": 5, "slides": [_slide("s1", images[0])], "music": []}
        # Loading alone does not rewrite the file.
        assert json.loads(project_file.read_text()) == v2

        assert client.put("/api/project", json=loaded).status_code == 200

    on_disk = json.loads(project_file.read_text())
    assert on_disk == loaded


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ({"schemaVersion": 1, "slides": []}, {"schemaVersion": 5, "slides": [], "music": []}),
        (
            {"schemaVersion": 2, "slides": [], "music": []},
            {"schemaVersion": 5, "slides": [], "music": []},
        ),
        (
            {
                "schemaVersion": 2,
                "slides": [{"id": "s1", "mediaId": "m", "duration": 3.0, "transitionIn": None}],
                "music": [],
            },
            {
                "schemaVersion": 5,
                "slides": [
                    {
                        "kind": "image",
                        "id": "s1",
                        "mediaId": "m",
                        "duration": 3.0,
                        "effectId": None,
                        "title": None,
                        "transitionIn": None,
                    }
                ],
                "music": [],
            },
        ),
        # A slide that already carries `kind` (e.g. a video slide) keeps it; only
        # the version-3 step adds its `effectId`.
        (
            {
                "schemaVersion": 2,
                "slides": [
                    {"kind": "video", "id": "v1", "mediaId": "m", "trimIn": 0, "trimOut": 5}
                ],
                "music": [],
            },
            {
                "schemaVersion": 5,
                "slides": [
                    {
                        "kind": "video",
                        "id": "v1",
                        "mediaId": "m",
                        "trimIn": 0,
                        "trimOut": 5,
                        "effectId": None,
                        "title": None,
                    }
                ],
                "music": [],
            },
        ),
        # Version 3 (before effects): every slide gets `effectId: null`, image and
        # video alike (add-effects-catalog design.md D3).
        (
            {
                "schemaVersion": 3,
                "slides": [
                    {
                        "kind": "image",
                        "id": "s1",
                        "mediaId": "m",
                        "duration": 3.0,
                        "transitionIn": None,
                    },
                    {
                        "kind": "video",
                        "id": "v1",
                        "mediaId": "v",
                        "trimIn": 0,
                        "trimOut": 5,
                        "transitionIn": {"transitionId": "fade", "duration": 1.0},
                    },
                ],
                "music": [],
            },
            {
                "schemaVersion": 5,
                "slides": [
                    {
                        "kind": "image",
                        "id": "s1",
                        "mediaId": "m",
                        "duration": 3.0,
                        "transitionIn": None,
                        "effectId": None,
                        "title": None,
                    },
                    {
                        "kind": "video",
                        "id": "v1",
                        "mediaId": "v",
                        "trimIn": 0,
                        "trimOut": 5,
                        "transitionIn": {"transitionId": "fade", "duration": 1.0},
                        "effectId": None,
                        "title": None,
                    },
                ],
                "music": [],
            },
        ),
        # An `effectId` that is already there (any version-3 file written by a
        # newer client) is never overwritten.
        (
            {
                "schemaVersion": 3,
                "slides": [
                    {
                        "kind": "image",
                        "id": "s1",
                        "mediaId": "m",
                        "duration": 3.0,
                        "transitionIn": None,
                        "effectId": "sepia",
                    }
                ],
                "music": [],
            },
            {
                "schemaVersion": 5,
                "slides": [
                    {
                        "kind": "image",
                        "id": "s1",
                        "mediaId": "m",
                        "duration": 3.0,
                        "transitionIn": None,
                        "effectId": "sepia",
                        "title": None,
                    }
                ],
                "music": [],
            },
        ),
        # Not a clean version 1: left as is, so validation rejects it.
        ({"schemaVersion": 1, "slides": [], "music": []}, None),
        ([], None),
    ],
)
def test_migrate_project_data(raw: Any, expected: Any) -> None:
    assert migrate_project_data(raw) == (raw if expected is None else expected)


@pytest.mark.parametrize(
    "content",
    [
        {"schemaVersion": 6, "slides": [], "music": []},
        {"schemaVersion": 1, "slides": [], "music": []},
        {"schemaVersion": 2, "slides": []},
        {"schemaVersion": 1, "slides": [{"id": "x"}]},
    ],
)
def test_invalid_stored_project_counts_as_corrupt(settings: Settings, content: Any) -> None:
    settings.data_dir.mkdir(parents=True)
    (settings.data_dir / "project.json").write_text(json.dumps(content))
    store = ProjectStore(settings.data_dir)
    assert store.get() == Project(schema_version=5, slides=[], music=[])


# --- Rejections ---------------------------------------------------------------------------

M = ["body", "music"]
S = ["body", "slides"]

# name -> (mutation, expected loc, code, English message or None)
Rejection = tuple[Any, list[Any], str, str | None]


def _rejections(images: list[str], audio: list[str]) -> dict[str, Rejection]:
    def clip_field(index: int, field: str, value: Any) -> Any:
        def mutate(p: dict[str, Any]) -> None:
            p["music"][index][field] = value

        return mutate

    def drop_field(index: int, field: str) -> Any:
        return lambda p: p["music"][index].pop(field)

    def too_many(p: dict[str, Any]) -> None:
        p["music"] = [_clip(f"m{i}", audio[0]) for i in range(MAX_MUSIC_CLIPS + 1)]

    def missing_music(p: dict[str, Any]) -> None:
        del p["music"]

    def version_1(p: dict[str, Any]) -> None:
        p["schemaVersion"] = 1

    def audio_slide(p: dict[str, Any]) -> None:
        p["slides"][1]["mediaId"] = audio[1]

    def extra(p: dict[str, Any]) -> None:
        p["music"][0]["start"] = 0

    return {
        # Structure (FastAPI's native 422 list).
        "volume_too_high": (
            clip_field(1, "volume", 2.01),
            [*M, 1, "volume"],
            "project.musicVolume.outOfRange",
            "The music volume must be between 0 and 2 (is 2.01).",
        ),
        "volume_negative": (
            clip_field(1, "volume", -0.5),
            [*M, 1, "volume"],
            "project.musicVolume.outOfRange",
            "The music volume must be between 0 and 2 (is -0.5).",
        ),
        "volume_bool": (clip_field(1, "volume", True), [*M, 1, "volume"], "float_type", None),
        "volume_string": (clip_field(1, "volume", "1"), [*M, 1, "volume"], "float_type", None),
        "trim_start_negative": (
            clip_field(0, "trimStart", -1),
            [*M, 0, "trimStart"],
            "project.musicTrim.negative",
            "The start and end of a music clip must be 0 s or later (is -1 s).",
        ),
        "trim_end_negative": (
            clip_field(0, "trimEnd", -0.25),
            [*M, 0, "trimEnd"],
            "project.musicTrim.negative",
            "The start and end of a music clip must be 0 s or later (is -0.25 s).",
        ),
        "fade_in_not_bool": (clip_field(0, "fadeIn", 1), [*M, 0, "fadeIn"], "bool_type", None),
        "fade_out_string": (
            clip_field(0, "fadeOut", "true"),
            [*M, 0, "fadeOut"],
            "bool_type",
            None,
        ),
        "bad_clip_id": (
            clip_field(0, "id", "a b"),
            [*M, 0, "id"],
            "string_pattern_mismatch",
            None,
        ),
        "missing_volume": (drop_field(2, "volume"), [*M, 2, "volume"], "missing", None),
        "missing_trim_end": (drop_field(2, "trimEnd"), [*M, 2, "trimEnd"], "missing", None),
        "extra_clip_field": (extra, [*M, 0, "start"], "extra_forbidden", None),
        "too_many_clips": (too_many, M, "too_long", None),
        "missing_music": (missing_music, M, "missing", None),
        "version_1_via_api": (version_1, ["body", "schemaVersion"], "literal_error", None),
        # References (`project.invalid`).
        "unknown_music_media": (
            clip_field(1, "mediaId", "f" * 32),
            [*M, 1, "mediaId"],
            "project.music.unknownMedia",
            f"Music clip 2 (ID “m2”): unknown media item “{'f' * 32}”.",
        ),
        "image_in_music": (
            clip_field(2, "mediaId", images[0]),
            [*M, 2, "mediaId"],
            "project.music.notAudio",
            f"Music clip 3 (ID “m3”): media item “{images[0]}” is not an audio file.",
        ),
        "audio_in_slides": (
            audio_slide,
            [*S, 1, "mediaId"],
            "project.slide.notImage",
            f"Slide 2 (ID “s2”): media item “{audio[1]}” is not an image.",
        ),
        "duplicate_clip_id": (
            clip_field(2, "id", "m1"),
            [*M, 2, "id"],
            "project.music.duplicateId",
            "Music clip 3 (ID “m1”): the ID is already used by music clip 1.",
        ),
        "trim_end_beyond_file": (
            clip_field(0, "trimEnd", 3.5),
            [*M, 0, "trimEnd"],
            "project.music.trimEndBeyondFile",
            "Music clip 1 (ID “m1”): the end (3.5 s) lies beyond the end of the file (3 s).",
        ),
        "trim_start_after_end": (
            clip_field(0, "trimStart", 2.5),
            [*M, 0, "trimStart"],
            "project.music.trimStartNotBeforeEnd",
            "Music clip 1 (ID “m1”): the start (2.5 s) must lie before the end (2.5 s).",
        ),
        "trim_start_beyond_file": (
            clip_field(2, "trimStart", 4),
            [*M, 2, "trimStart"],
            "project.music.trimStartNotBeforeEnd",
            "Music clip 3 (ID “m3”): the start (4 s) must lie before the end (3 s).",
        ),
        "clip_too_short": (
            clip_field(0, "trimEnd", 0.75),
            [*M, 0],
            "project.music.tooShort",
            "Music clip 1 (ID “m1”): the clip must play at least 0.5 s (plays 0.25 s).",
        ),
        "tail_too_short": (
            clip_field(2, "trimStart", 2.75),
            [*M, 2],
            "project.music.tooShort",
            "Music clip 3 (ID “m3”): the clip must play at least 0.5 s (plays 0.25 s).",
        ),
    }


REJECTIONS = list(_rejections(["x"], ["y", "z"]))


def _issues(detail: Any) -> list[dict[str, Any]]:
    if isinstance(detail, dict):
        assert detail["code"] == "project.invalid"
        return [{k: i[k] for k in ("loc", "code", "message")} for i in detail["issues"]]
    return [{"loc": d["loc"], "code": d["type"], "message": d["msg"]} for d in detail]


@pytest.mark.parametrize("rule", REJECTIONS)
def test_invalid_music_is_rejected_and_keeps_previous_project(
    client: TestClient, settings: Settings, rule: str
) -> None:
    images, audio = _media(client)
    previous = _project(images, audio)
    assert client.put("/api/project", json=previous).status_code == 200
    saved = client.get("/api/project").json()
    file_before = (settings.data_dir / "project.json").read_bytes()

    mutate, loc, code, message = _rejections(images, audio)[rule]
    bad = _project(images, audio)
    mutate(bad)
    res = client.put("/api/project", json=bad)

    assert res.status_code == 422, res.text
    issues = _issues(res.json()["detail"])
    matching = [i for i in issues if i["loc"] == loc]
    assert matching, issues
    assert matching[0]["code"] == code
    if message is not None:
        assert matching[0]["message"] == message
    assert client.get("/api/project").json() == saved
    assert (settings.data_dir / "project.json").read_bytes() == file_before


def test_trim_issue_params(client: TestClient) -> None:
    images, audio = _media(client)
    bad = _project(images, audio)
    bad["music"][0]["trimEnd"] = 9
    detail = client.put("/api/project", json=bad).json()["detail"]
    [issue] = detail["issues"]
    assert issue["params"] == {"clip": 1, "clipId": "m1", "trimEnd": 9.0, "duration": 3.0}


# --- Cascade on delete --------------------------------------------------------------------


def test_deleting_audio_removes_its_music_clips(client: TestClient, settings: Settings) -> None:
    images, audio = _media(client)
    project = _project(images, audio)
    assert client.put("/api/project", json=project).status_code == 200
    before = client.get("/api/project").json()

    res = client.delete(f"/api/media/{audio[0]}")
    assert res.status_code == 200, res.text
    expected = {**before, "music": [before["music"][1]]}  # m1 and m3 gone, m2 moves up
    assert res.json() == {"project": expected}
    assert client.get("/api/project").json() == expected
    assert json.loads((settings.data_dir / "project.json").read_text()) == expected
    assert [m["id"] for m in client.get("/api/media").json()["items"]] == [*images, audio[1]]


def test_deleting_an_image_keeps_the_music(client: TestClient) -> None:
    images, audio = _media(client)
    assert client.put("/api/project", json=_project(images, audio)).status_code == 200
    before = client.get("/api/project").json()

    res = client.delete(f"/api/media/{images[0]}")
    assert res.status_code == 200, res.text
    assert res.json()["project"] == {**before, "slides": [before["slides"][1]]}


def test_remove_media_slides_drops_music_clips() -> None:
    def clip(clip_id: str, media_id: str) -> MusicClip:
        return MusicClip(
            id=clip_id,
            media_id=media_id,
            trim_start=0,
            trim_end=None,
            volume=1,
            fade_in=False,
            fade_out=False,
        )

    project = Project(
        schema_version=5,
        slides=[
            ImageSlide(
                kind="image",
                id="s",
                media_id="img",
                duration=3,
                effect_id=None,
                title=None,
                transition_in=None,
            )
        ],
        music=[clip("a", "x"), clip("b", "y"), clip("c", "x")],
    )
    updated = remove_media_slides(project, "x")
    assert [c.id for c in updated.music] == ["b"]
    assert updated.slides == project.slides


# --- Delete while an export uses the audio -----------------------------------------------


class FakeExport:
    """Replaces `export_movie` without GL; runs until `release()` or cancel."""

    def __init__(self) -> None:
        self.running = threading.Event()
        self.released = threading.Event()

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
        fake.released.set()


def _wait_status(client: TestClient, export_id: str, wanted: str) -> None:
    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline:
        if client.get(f"/api/exports/{export_id}").json()["status"] == wanted:
            return
        time.sleep(0.02)
    raise AssertionError(f"export {export_id} did not reach {wanted}")


def test_delete_audio_is_rejected_while_an_export_uses_it(
    client: TestClient, fake_export: FakeExport
) -> None:
    images, audio = _media(client)
    project = _project(images, audio)
    project["music"] = [_clip("m1", audio[0])]
    assert client.put("/api/project", json=project).status_code == 200
    saved = client.get("/api/project").json()
    res = client.post("/api/exports", json={"profile": "small", "fileName": "Movie"})
    assert res.status_code == 202, res.text
    export_id = res.json()["id"]
    assert fake_export.running.wait(TIMEOUT)

    res = client.delete(f"/api/media/{audio[0]}")
    assert res.status_code == 409, res.text
    detail = res.json()["detail"]
    assert detail["code"] == "media.inUseByExport"
    assert detail["params"] == {"mediaId": audio[0], "exportId": export_id}
    assert detail["message"].startswith("The medium cannot be deleted")
    assert client.get("/api/project").json() == saved

    # Audio the export does not use can be deleted.
    assert client.delete(f"/api/media/{audio[1]}").status_code == 200

    fake_export.released.set()
    _wait_status(client, export_id, "done")
    assert client.delete(f"/api/media/{audio[0]}").status_code == 200
    assert client.get("/api/project").json()["music"] == []


def test_openapi_documents_music_clip(client: TestClient) -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    assert schemas["Project"]["required"] == ["schemaVersion", "slides", "music"]
    assert schemas["Project"]["properties"]["schemaVersion"]["const"] == 5
    clip = schemas["MusicClip"]
    assert clip["required"] == [
        "id",
        "mediaId",
        "trimStart",
        "trimEnd",
        "volume",
        "fadeIn",
        "fadeOut",
    ]
    assert clip["properties"]["volume"]["maximum"] == 2.0
