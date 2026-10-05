"""Project version 6: narration track and the global clip-audio level, migration
from version 5, reference checks against kind and duration, cascade on delete
(TASK-API-021, add-narration-and-audio-levels design.md D2 and D4, spec
narration-track).

The narration track is the first audio track with a **stored** start time: a
clip sits at its absolute `at` on the movie timeline instead of following the
clip before it, and two clips may overlap. Everything else — media reference,
trim, volume, fades, the 100-clip limit — works exactly as on the music track,
so the checks are shared (`_check_audio_track`) and tested here per track.
"""

import asyncio
import io
import json
import math
import struct
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
    MAX_NARRATION_CLIPS,
    NARRATION_AT_MAX,
    ImageSlide,
    MusicClip,
    NarrationClip,
    Project,
    ProjectStore,
    empty_project,
    migrate_project_data,
    remove_media_slides,
)

AUDIO_SECONDS = 3.0


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
    """A narration clip at 0 playing the whole recording; `fields` overrides."""
    clip = {
        "id": clip_id,
        "mediaId": media_id,
        "at": 0.0,
        "trimStart": 0,
        "trimEnd": None,
        "volume": 1,
        "fadeIn": False,
        "fadeOut": False,
    }
    clip.update(fields)
    return clip


def _project(images: list[str], audio: list[str], **fields: Any) -> dict[str, Any]:
    """Two pictures plus three narration clips, the last two overlapping."""
    project = {
        "schemaVersion": 6,
        "slides": [_slide("s1", images[0]), _slide("s2", images[1])],
        "music": [],
        "narration": [
            _clip("n1", audio[0], at=0.0, trimStart=0.5, trimEnd=2.5, volume=0.5, fadeIn=True),
            _clip("n2", audio[1], at=4.25, fadeOut=True),
            _clip("n3", audio[0], at=5.5, trimStart=1, volume=2),
        ],
        "clipAudioBalance": 50,
    }
    project.update(fields)
    return project


# --- Save and load ------------------------------------------------------------------


def test_put_then_get_roundtrip_with_narration(client: TestClient, settings: Settings) -> None:
    images, audio = _media(client)
    project = _project(images, audio)

    res = client.put("/api/project", json=project)
    assert res.status_code == 200, res.text
    assert res.json() == project
    assert client.get("/api/project").json() == project
    assert json.loads((settings.data_dir / "project.json").read_text()) == project


def test_moving_a_clip_only_changes_its_own_start_time(client: TestClient) -> None:
    """A narration clip's `at` is stored, so moving one leaves the others where
    they are — unlike the music track, where clips follow each other."""
    images, audio = _media(client)
    assert client.put("/api/project", json=_project(images, audio)).status_code == 200

    moved = _project(images, audio)
    moved["narration"][0]["at"] = 7.75
    assert client.put("/api/project", json=moved).status_code == 200

    saved = client.get("/api/project").json()["narration"]
    assert [(c["id"], c["at"]) for c in saved] == [("n1", 7.75), ("n2", 4.25), ("n3", 5.5)]


def test_overlapping_clips_are_accepted(client: TestClient) -> None:
    """Overlap is allowed by design (design.md D2): both are kept, neither is
    shortened or dropped."""
    images, audio = _media(client)
    project = _project(images, audio)
    # n2 plays 4.25 to 7.25 s, n3 5.5 to 7.5 s — 1.75 s of overlap.
    project["narration"] = [
        _clip("n1", audio[0], at=4.25),
        _clip("n2", audio[1], at=5.5),
        # Same start, same medium, same length: still two clips.
        _clip("n3", audio[1], at=5.5),
    ]
    assert client.put("/api/project", json=project).status_code == 200
    saved = client.get("/api/project").json()["narration"]
    assert [(c["id"], c["at"]) for c in saved] == [("n1", 4.25), ("n2", 5.5), ("n3", 5.5)]


def test_valid_edges_are_accepted(client: TestClient) -> None:
    images, audio = _media(client)
    project = _project(images, audio)
    project["narration"] = [
        # `at` is not on the duration grid: a recording starts where it starts.
        _clip("n1", audio[0], at=0.0, volume=0.0),
        _clip("n2", audio[0], at=1.234_567, volume=2.0, trimEnd=AUDIO_SECONDS),
        _clip("n3", audio[1], at=NARRATION_AT_MAX, trimStart=2.5),
    ]
    project["clipAudioBalance"] = 0
    assert client.put("/api/project", json=project).status_code == 200
    assert client.get("/api/project").json() == project


def test_both_audio_levels_at_the_edges_are_accepted(client: TestClient) -> None:
    images, audio = _media(client)
    for balance in (0, 50, 100):
        project = _project(images, audio, clipAudioBalance=balance)
        assert client.put("/api/project", json=project).status_code == 200, balance
        assert client.get("/api/project").json()["clipAudioBalance"] == balance


def test_max_narration_clips_are_accepted(client: TestClient) -> None:
    images, audio = _media(client)
    project = _project(images, audio)
    project["narration"] = [
        _clip(f"n{i}", audio[0], at=i * 0.5) for i in range(MAX_NARRATION_CLIPS)
    ]
    res = client.put("/api/project", json=project)
    assert res.status_code == 200, res.text
    assert len(client.get("/api/project").json()["narration"]) == MAX_NARRATION_CLIPS


def test_empty_project_carries_an_empty_track_and_the_default_level(client: TestClient) -> None:
    assert client.get("/api/project").json() == {
        "schemaVersion": 6,
        "slides": [],
        "music": [],
        "narration": [],
        "clipAudioBalance": 50,
    }


# --- Migration from version 5 -------------------------------------------------------


def _v5(images: list[str]) -> dict[str, Any]:
    return {
        "schemaVersion": 5,
        "slides": [_slide("s1", images[0])],
        "music": [],
    }


def test_version_5_file_loads_with_an_empty_narration_track(
    client: TestClient, settings: Settings
) -> None:
    images, _ = _media(client)
    project_file = settings.data_dir / "project.json"
    v5 = _v5(images)
    project_file.write_text(json.dumps(v5))

    with TestClient(create_app(settings)) as migrated:
        loaded = migrated.get("/api/project").json()
        assert loaded == {
            "schemaVersion": 6,
            "slides": [_slide("s1", images[0])],
            "music": [],
            "narration": [],
            "clipAudioBalance": 50,
        }
        # Loading alone does not rewrite the file (and keeps no backup).
        assert json.loads(project_file.read_text()) == v5
        assert not list(settings.data_dir.glob("project.json.corrupt-*"))

        assert migrated.put("/api/project", json=loaded).status_code == 200

    assert json.loads(project_file.read_text()) == loaded


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # Version 5 gains the two new fields and nothing else.
        (
            {
                "schemaVersion": 5,
                "slides": [
                    {
                        "kind": "title",
                        "id": "t1",
                        "lines": ["Hello"],
                        "creditEntries": None,
                        "styleId": "plain",
                        "color": "#ffffff",
                        "duration": 5.0,
                        "transitionIn": None,
                    }
                ],
                "music": [],
            },
            {
                "schemaVersion": 6,
                "slides": [
                    {
                        "kind": "title",
                        "id": "t1",
                        "lines": ["Hello"],
                        "creditEntries": None,
                        "styleId": "plain",
                        "color": "#ffffff",
                        "duration": 5.0,
                        "transitionIn": None,
                    }
                ],
                "music": [],
                "narration": [],
                "clipAudioBalance": 50,
            },
        ),
        # The whole chain in one go: version 1 arrives at 6.
        (
            {"schemaVersion": 1, "slides": [{"id": "s1", "mediaId": "m", "duration": 3.0}]},
            {
                "schemaVersion": 6,
                "slides": [
                    {
                        "kind": "image",
                        "id": "s1",
                        "mediaId": "m",
                        "duration": 3.0,
                        "effectId": None,
                        "title": None,
                    }
                ],
                "music": [],
                "narration": [],
                "clipAudioBalance": 50,
            },
        ),
        # Not a clean version 5 (narration already there): left as is, so
        # validation rejects it rather than silently repairing the file.
        ({"schemaVersion": 5, "slides": [], "music": [], "narration": []}, None),
        (
            {"schemaVersion": 5, "slides": [], "music": [], "clipAudioBalance": 10},
            None,
        ),
        # Already current: untouched.
        (
            {
                "schemaVersion": 6,
                "slides": [],
                "music": [],
                "narration": [],
                "clipAudioBalance": 10,
            },
            None,
        ),
    ],
)
def test_migrate_project_data_to_version_6(raw: Any, expected: Any) -> None:
    assert migrate_project_data(raw) == (raw if expected is None else expected)


def test_a_version_5_file_with_a_narration_track_counts_as_corrupt(settings: Settings) -> None:
    settings.data_dir.mkdir(parents=True)
    content = {"schemaVersion": 5, "slides": [], "music": [], "narration": []}
    (settings.data_dir / "project.json").write_text(json.dumps(content))
    store = ProjectStore(settings.data_dir)
    assert store.get() == empty_project()


# --- Rejections ---------------------------------------------------------------------


N = ["body", "narration"]

# name -> (mutation, expected loc, code, English message or None)
Rejection = tuple[Any, list[Any], str, str | None]


def _rejections(images: list[str], audio: list[str]) -> dict[str, Rejection]:
    def clip_field(index: int, field: str, value: Any) -> Any:
        def mutate(p: dict[str, Any]) -> None:
            p["narration"][index][field] = value

        return mutate

    def drop_field(index: int, field: str) -> Any:
        return lambda p: p["narration"][index].pop(field)

    def too_many(p: dict[str, Any]) -> None:
        p["narration"] = [_clip(f"n{i}", audio[0]) for i in range(MAX_NARRATION_CLIPS + 1)]

    def missing_narration(p: dict[str, Any]) -> None:
        del p["narration"]

    def missing_balance(p: dict[str, Any]) -> None:
        del p["clipAudioBalance"]

    def balance(value: Any) -> Any:
        def mutate(p: dict[str, Any]) -> None:
            p["clipAudioBalance"] = value

        return mutate

    def extra(p: dict[str, Any]) -> None:
        p["narration"][0]["start"] = 0

    return {
        # Structure (FastAPI's native 422 list).
        "at_negative": (
            clip_field(1, "at", -0.5),
            [*N, 1, "at"],
            "project.narrationAt.outOfRange",
            f"The start time of a narration clip must be between 0 and {NARRATION_AT_MAX:g} s "
            "(is -0.5 s).",
        ),
        "at_beyond_the_longest_movie": (
            clip_field(1, "at", NARRATION_AT_MAX + 1),
            [*N, 1, "at"],
            "project.narrationAt.outOfRange",
            f"The start time of a narration clip must be between 0 and {NARRATION_AT_MAX:g} s "
            f"(is {NARRATION_AT_MAX + 1:g} s).",
        ),
        "at_bool": (clip_field(1, "at", True), [*N, 1, "at"], "float_type", None),
        "at_string": (clip_field(1, "at", "4"), [*N, 1, "at"], "float_type", None),
        "missing_at": (drop_field(1, "at"), [*N, 1, "at"], "missing", None),
        "volume_too_high": (
            clip_field(1, "volume", 2.01),
            [*N, 1, "volume"],
            "project.narrationVolume.outOfRange",
            "The narration volume must be between 0 and 2 (is 2.01).",
        ),
        "volume_negative": (
            clip_field(1, "volume", -0.5),
            [*N, 1, "volume"],
            "project.narrationVolume.outOfRange",
            "The narration volume must be between 0 and 2 (is -0.5).",
        ),
        "volume_string": (clip_field(1, "volume", "1"), [*N, 1, "volume"], "float_type", None),
        "trim_start_negative": (
            clip_field(0, "trimStart", -1),
            [*N, 0, "trimStart"],
            "project.narrationTrim.negative",
            "The start and end of a narration clip must be 0 s or later (is -1 s).",
        ),
        "trim_end_negative": (
            clip_field(0, "trimEnd", -0.25),
            [*N, 0, "trimEnd"],
            "project.narrationTrim.negative",
            "The start and end of a narration clip must be 0 s or later (is -0.25 s).",
        ),
        "fade_in_not_bool": (clip_field(0, "fadeIn", 1), [*N, 0, "fadeIn"], "bool_type", None),
        "bad_clip_id": (
            clip_field(0, "id", "a b"),
            [*N, 0, "id"],
            "string_pattern_mismatch",
            None,
        ),
        "missing_volume": (drop_field(2, "volume"), [*N, 2, "volume"], "missing", None),
        "missing_trim_end": (drop_field(2, "trimEnd"), [*N, 2, "trimEnd"], "missing", None),
        "extra_clip_field": (extra, [*N, 0, "start"], "extra_forbidden", None),
        "too_many_clips": (too_many, N, "too_long", None),
        "missing_narration": (missing_narration, N, "missing", None),
        # The one global level (design.md D4).
        "balance_too_high": (
            balance(101),
            ["body", "clipAudioBalance"],
            "project.clipAudioBalance.outOfRange",
            "The audio level must be between 0 and 100 (is 101).",
        ),
        "balance_negative": (
            balance(-1),
            ["body", "clipAudioBalance"],
            "project.clipAudioBalance.outOfRange",
            "The audio level must be between 0 and 100 (is -1).",
        ),
        "balance_fraction": (balance(50.5), ["body", "clipAudioBalance"], "int_type", None),
        "balance_bool": (balance(True), ["body", "clipAudioBalance"], "int_type", None),
        "balance_string": (balance("50"), ["body", "clipAudioBalance"], "int_type", None),
        "missing_balance": (missing_balance, ["body", "clipAudioBalance"], "missing", None),
        # References (`project.invalid`).
        "unknown_narration_media": (
            clip_field(1, "mediaId", "f" * 32),
            [*N, 1, "mediaId"],
            "project.narration.unknownMedia",
            f"Narration clip 2 (ID “n2”): unknown media item “{'f' * 32}”.",
        ),
        "image_in_narration": (
            clip_field(2, "mediaId", images[0]),
            [*N, 2, "mediaId"],
            "project.narration.notAudio",
            f"Narration clip 3 (ID “n3”): media item “{images[0]}” is not an audio file.",
        ),
        "duplicate_clip_id": (
            clip_field(2, "id", "n1"),
            [*N, 2, "id"],
            "project.narration.duplicateId",
            "Narration clip 3 (ID “n1”): the ID is already used by narration clip 1.",
        ),
        "trim_end_beyond_file": (
            clip_field(0, "trimEnd", 3.5),
            [*N, 0, "trimEnd"],
            "project.narration.trimEndBeyondFile",
            "Narration clip 1 (ID “n1”): the end (3.5 s) lies beyond the end of the file (3 s).",
        ),
        "trim_start_after_end": (
            clip_field(0, "trimStart", 2.5),
            [*N, 0, "trimStart"],
            "project.narration.trimStartNotBeforeEnd",
            "Narration clip 1 (ID “n1”): the start (2.5 s) must lie before the end (2.5 s).",
        ),
        "clip_too_short": (
            clip_field(0, "trimEnd", 0.75),
            [*N, 0],
            "project.narration.tooShort",
            "Narration clip 1 (ID “n1”): the clip must play at least 0.5 s (plays 0.25 s).",
        ),
    }


REJECTIONS = list(_rejections(["x"], ["y", "z"]))


def _issues(detail: Any) -> list[dict[str, Any]]:
    if isinstance(detail, dict):
        assert detail["code"] == "project.invalid"
        return [{k: i[k] for k in ("loc", "code", "message")} for i in detail["issues"]]
    return [{"loc": d["loc"], "code": d["type"], "message": d["msg"]} for d in detail]


@pytest.mark.parametrize("rule", REJECTIONS)
def test_invalid_narration_is_rejected_and_keeps_previous_project(
    client: TestClient, settings: Settings, rule: str
) -> None:
    images, audio = _media(client)
    assert client.put("/api/project", json=_project(images, audio)).status_code == 200
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


def test_an_audio_medium_may_be_on_both_tracks(client: TestClient) -> None:
    """The two tracks are independent: the same recording can be music and
    narration, and an ID is only unique within its own track."""
    images, audio = _media(client)
    project = _project(images, audio)
    project["music"] = [
        {
            "id": "n1",
            "mediaId": audio[0],
            "trimStart": 0,
            "trimEnd": None,
            "volume": 1,
            "fadeIn": False,
            "fadeOut": False,
        }
    ]
    res = client.put("/api/project", json=project)
    assert res.status_code == 200, res.text
    assert client.get("/api/project").json() == project


# --- Cascade on delete --------------------------------------------------------------


def test_deleting_audio_removes_its_narration_clips(client: TestClient) -> None:
    images, audio = _media(client)
    assert client.put("/api/project", json=_project(images, audio)).status_code == 200

    res = client.delete(f"/api/media/{audio[0]}")
    assert res.status_code == 200, res.text
    # n1 and n3 used audio[0]; n2 stays at its own `at`.
    assert [(c["id"], c["at"]) for c in res.json()["project"]["narration"]] == [("n2", 4.25)]
    assert client.get("/api/project").json()["narration"] == [
        _clip("n2", audio[1], at=4.25, fadeOut=True)
    ]


def test_deleting_an_image_keeps_the_narration(client: TestClient) -> None:
    images, audio = _media(client)
    project = _project(images, audio)
    assert client.put("/api/project", json=project).status_code == 200

    res = client.delete(f"/api/media/{images[0]}")
    assert res.status_code == 200, res.text
    assert res.json()["project"]["narration"] == project["narration"]


def test_remove_media_slides_drops_narration_clips() -> None:
    def narration(clip_id: str, media_id: str, at: float) -> NarrationClip:
        return NarrationClip(
            id=clip_id,
            media_id=media_id,
            at=at,
            trim_start=0,
            trim_end=None,
            volume=1,
            fade_in=False,
            fade_out=False,
        )

    project = Project(
        schema_version=6,
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
        music=[
            MusicClip(
                id="m",
                media_id="x",
                trim_start=0,
                trim_end=None,
                volume=1,
                fade_in=False,
                fade_out=False,
            )
        ],
        narration=[narration("a", "x", 0), narration("b", "y", 1.5), narration("c", "x", 3.0)],
        clip_audio_balance=50,
    )
    updated = remove_media_slides(project, "x")
    # The surviving clip keeps its own start time: nothing moves up.
    assert [(c.id, c.at) for c in updated.narration] == [("b", 1.5)]
    assert updated.music == []
    assert updated.slides == project.slides
    assert updated.clip_audio_balance == 50


def test_remove_media_keeps_the_level_and_writes_only_on_change(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        images, audio = _media(client)
        project = _project(images, audio, clipAudioBalance=75)
        assert client.put("/api/project", json=project).status_code == 200
        store: ProjectStore = client.app.state.project  # type: ignore[attr-defined]
        before = (settings.data_dir / "project.json").read_bytes()

        asyncio.run(store.remove_media("f" * 32))
        assert (settings.data_dir / "project.json").read_bytes() == before

        updated = asyncio.run(store.remove_media(audio[1]))
        assert updated.clip_audio_balance == 75
        assert [c.id for c in updated.narration] == ["n1", "n3"]


# --- API document -------------------------------------------------------------------


def test_openapi_documents_the_narration_clip(client: TestClient) -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    clip = schemas["NarrationClip"]
    assert clip["required"] == [
        "id",
        "mediaId",
        "at",
        "trimStart",
        "trimEnd",
        "volume",
        "fadeIn",
        "fadeOut",
    ]
    assert clip["properties"]["at"]["minimum"] == 0
    assert clip["properties"]["at"]["maximum"] == NARRATION_AT_MAX
    assert clip["properties"]["volume"]["maximum"] == 2.0
    narration = schemas["Project"]["properties"]["narration"]
    assert narration["maxItems"] == MAX_NARRATION_CLIPS
    balance = schemas["Project"]["properties"]["clipAudioBalance"]
    assert (balance["minimum"], balance["maximum"]) == (0, 100)


def test_the_data_file_keeps_absolute_start_times(client: TestClient, tmp_path: Path) -> None:
    """A saved project is round-trippable through a fresh store: `at` survives
    as a stored field, it is not re-derived from the order."""
    images, audio = _media(client)
    project = _project(images, audio)
    project["narration"] = [_clip("n1", audio[0], at=9.5), _clip("n2", audio[1], at=2.25)]
    assert client.put("/api/project", json=project).status_code == 200
    data_dir = client.app.state.project.data_dir  # type: ignore[attr-defined]
    assert [(c.id, c.at) for c in ProjectStore(data_dir).get().narration] == [
        ("n1", 9.5),
        ("n2", 2.25),
    ]
