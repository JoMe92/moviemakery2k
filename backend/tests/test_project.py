"""GET/PUT /api/project: save, load, rejection rules, cascade (TASK-API-004);
video slides, trim validation and migration from version 2
(TASK-API-018, add-timeline-editing design.md D1)."""

import asyncio
import io
import json
import subprocess
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from mmy_backend.config import Settings
from mmy_backend.ffmpeg import ffmpeg_binary
from mmy_backend.main import create_app
from mmy_backend.project import Project, ProjectStore, on_grid

EMPTY = {"schemaVersion": 5, "slides": [], "music": []}


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def _upload(client: TestClient, count: int) -> list[str]:
    files = []
    for i in range(count):
        buf = io.BytesIO()
        Image.new("RGB", (8, 6), (i * 40, 10, 10)).save(buf, "PNG")
        files.append(("files", (f"image{i}.png", buf.getvalue(), "image/png")))
    res = client.post("/api/media", files=files)
    assert res.status_code == 200, res.text
    return [r["item"]["id"] for r in res.json()["items"]]


def _slide(
    slide_id: str,
    media_id: str,
    duration: float = 5.0,
    transition: tuple[str, float] | None = None,
    effect: str | None = None,
) -> dict[str, Any]:
    return {
        "kind": "image",
        "id": slide_id,
        "mediaId": media_id,
        "duration": duration,
        "effectId": effect,
        "title": None,
        "transitionIn": (
            None
            if transition is None
            else {"transitionId": transition[0], "duration": transition[1]}
        ),
    }


def _video_slide(
    slide_id: str,
    media_id: str,
    trim_in: float,
    trim_out: float,
    transition: tuple[str, float] | None = None,
    effect: str | None = None,
) -> dict[str, Any]:
    return {
        "kind": "video",
        "id": slide_id,
        "mediaId": media_id,
        "trimIn": trim_in,
        "trimOut": trim_out,
        "effectId": effect,
        "title": None,
        "transitionIn": (
            None
            if transition is None
            else {"transitionId": transition[0], "duration": transition[1]}
        ),
    }


def _upload_video(client: TestClient, tmp_path: Path, seconds: float = 4.0) -> tuple[str, float]:
    """Uploads a tiny generated H.264 test video; returns (media id, reported duration)."""
    binary = ffmpeg_binary()
    assert binary is not None, "FFmpeg is part of the pixi environment"
    out = tmp_path / "video.mp4"
    subprocess.run(
        [
            binary,
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"testsrc=duration={seconds}:size=64x48:rate=10",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(out),
        ],
        check=True,
        capture_output=True,
    )
    res = client.post("/api/media", files=[("files", ("video.mp4", out.read_bytes(), "video/mp4"))])
    assert res.status_code == 200, res.text
    item = res.json()["items"][0]["item"]
    return item["id"], item["duration"]


def _valid_project(media: list[str]) -> dict[str, Any]:
    return {
        "schemaVersion": 5,
        "slides": [
            _slide("a", media[0], 5.0),
            _slide("b", media[1], 2.75, ("fade", 1.25)),
            _slide("c", media[0], 60, ("dissolve", 5)),
            _slide("d", media[1], 0.5, ("fade", 0.25)),
            _slide("e", media[0], 3.0),
        ],
        "music": [],
    }


def _valid_mixed_project(image_id: str, video_id: str, duration: float) -> dict[str, Any]:
    return {
        "schemaVersion": 5,
        "slides": [
            _slide("a", image_id, 5.0),
            _video_slide("b", video_id, 0.0, duration, ("fade", 1.0)),
        ],
        "music": [],
    }


def test_get_without_file_returns_empty_project(client: TestClient, settings: Settings) -> None:
    res = client.get("/api/project")
    assert res.status_code == 200
    assert res.json() == EMPTY
    assert not (settings.data_dir / "project.json").exists()


def test_put_then_get_roundtrip_with_transitions(client: TestClient, settings: Settings) -> None:
    media = _upload(client, 2)
    project = _valid_project(media)

    res = client.put("/api/project", json=project)
    assert res.status_code == 200, res.text
    assert res.json() == project

    assert client.get("/api/project").json() == project
    on_disk = json.loads((settings.data_dir / "project.json").read_text())
    assert on_disk == project
    assert not [p for p in settings.data_dir.iterdir() if p.name.startswith(".project-")]


def test_empty_project_can_be_saved(client: TestClient) -> None:
    assert client.put("/api/project", json=_valid_project(_upload(client, 2))).status_code == 200
    res = client.put("/api/project", json=EMPTY)
    assert res.status_code == 200
    assert client.get("/api/project").json() == EMPTY


def test_project_persists_across_app_instances(settings: Settings) -> None:
    with TestClient(create_app(settings)) as first:
        project = _valid_project(_upload(first, 2))
        assert first.put("/api/project", json=project).status_code == 200
    with TestClient(create_app(settings)) as second:
        assert second.get("/api/project").json() == project


Mutation = tuple[Any, list[Any], str, str | None]


def _mutations(media: list[str]) -> dict[str, Mutation]:
    """Name -> (mutation of the valid project, expected loc, error code, English message).

    Rule violations of this API carry their own code (design.md D5); FastAPI's own
    structural errors keep Pydantic's type and message (message None = not checked).
    """

    def slide_field(index: int, field: str, value: Any) -> Any:
        def mutate(p: dict[str, Any]) -> None:
            p["slides"][index][field] = value

        return mutate

    def transition_field(index: int, field: str, value: Any) -> Any:
        def mutate(p: dict[str, Any]) -> None:
            p["slides"][index]["transitionIn"][field] = value

        return mutate

    def first_with_transition(p: dict[str, Any]) -> None:
        p["slides"][0]["transitionIn"] = {"transitionId": "fade", "duration": 1.0}

    def duplicate_id(p: dict[str, Any]) -> None:
        p["slides"][3]["id"] = "b"

    def extra_project_field(p: dict[str, Any]) -> None:
        p["title"] = "x"

    def extra_slide_field(p: dict[str, Any]) -> None:
        p["slides"][1]["effect"] = None

    def wrong_schema(p: dict[str, Any]) -> None:
        p["schemaVersion"] = 1

    def too_many(p: dict[str, Any]) -> None:
        p["slides"] = [_slide(f"s{i}", media[0]) for i in range(1001)]

    s = ["body", "slides"]

    def image(index: int) -> list[Any]:
        """Pydantic's discriminated union inserts the matched `kind` into the loc of a
        structural (parsing-stage) error; reference-stage errors (built via `_issue`) do not."""
        return [*s, index, "image"]

    slide_range = "The slide duration must be between 0.5 and 60 s (is {} s)."
    transition_range = "The transition duration must be between 0.25 and 5 s (is {} s)."
    return {
        "unknown_media": (
            slide_field(2, "mediaId", "f" * 32),
            [*s, 2, "mediaId"],
            "project.slide.unknownMedia",
            f"Slide 3 (ID “c”): unknown media item “{'f' * 32}”.",
        ),
        "unknown_transition": (
            transition_field(1, "transitionId", "star-wipe-9000"),
            [*s, 1, "transitionIn", "transitionId"],
            "project.slide.unknownTransition",
            "Slide 2 (ID “b”): unknown transition “star-wipe-9000”.",
        ),
        "slide_too_short": (
            slide_field(1, "duration", 0.25),
            [*image(1), "duration"],
            "project.slideDuration.outOfRange",
            slide_range.format("0.25"),
        ),
        "slide_too_long": (
            slide_field(1, "duration", 60.25),
            [*image(1), "duration"],
            "project.slideDuration.outOfRange",
            slide_range.format("60.25"),
        ),
        "slide_off_grid": (
            slide_field(1, "duration", 2.1),
            [*image(1), "duration"],
            "project.slideDuration.offGrid",
            "The slide duration must be a multiple of 0.25 s (is 2.1 s).",
        ),
        "slide_bool": (
            slide_field(1, "duration", True),
            [*image(1), "duration"],
            "float_type",
            None,
        ),
        "transition_too_short": (
            transition_field(2, "duration", 0),
            [*image(2), "transitionIn", "duration"],
            "project.transitionDuration.outOfRange",
            transition_range.format("0"),
        ),
        "transition_too_long": (
            transition_field(2, "duration", 5.25),
            [*image(2), "transitionIn", "duration"],
            "project.transitionDuration.outOfRange",
            transition_range.format("5.25"),
        ),
        "transition_off_grid": (
            transition_field(2, "duration", 1.3),
            [*image(2), "transitionIn", "duration"],
            "project.transitionDuration.offGrid",
            "The transition duration must be a multiple of 0.25 s (is 1.3 s).",
        ),
        "first_slide_with_transition": (
            first_with_transition,
            [*s, 0, "transitionIn"],
            "project.slide.firstHasTransition",
            "Slide 1 (ID “a”): the first slide cannot have an incoming transition.",
        ),
        "duplicate_slide_id": (
            duplicate_id,
            [*s, 3, "id"],
            "project.slide.duplicateId",
            "Slide 4 (ID “b”): the ID is already used by slide 2.",
        ),
        "bad_slide_id": (
            slide_field(0, "id", "a b"),
            [*image(0), "id"],
            "string_pattern_mismatch",
            None,
        ),
        "extra_project_field": (extra_project_field, ["body", "title"], "extra_forbidden", None),
        "extra_slide_field": (extra_slide_field, [*image(1), "effect"], "extra_forbidden", None),
        "missing_transition_in": (
            lambda p: p["slides"][4].pop("transitionIn"),
            [*image(4), "transitionIn"],
            "missing",
            None,
        ),
        "wrong_schema_version": (wrong_schema, ["body", "schemaVersion"], "literal_error", None),
        "too_many_slides": (too_many, [*s], "too_long", None),
    }


RULES = list(_mutations(["x", "y"]))


def _issues(detail: Any) -> list[dict[str, Any]]:
    """Issues of a 422 body as {loc, code, params, message}, for both shapes:
    `project.invalid` (reference checks) and FastAPI's native list (parsing)."""
    if isinstance(detail, dict):
        assert detail["code"] == "project.invalid"
        return [
            {k: issue[k] for k in ("loc", "code", "params", "message")}
            for issue in detail["issues"]
        ]
    return [
        {"loc": d["loc"], "code": d["type"], "params": d.get("ctx") or {}, "message": d["msg"]}
        for d in detail
    ]


@pytest.mark.parametrize("rule", RULES)
def test_invalid_put_is_rejected_and_keeps_previous_project(
    client: TestClient, settings: Settings, rule: str
) -> None:
    media = _upload(client, 2)
    previous = _valid_project(media)
    previous["slides"] = previous["slides"][:2]
    assert client.put("/api/project", json=previous).status_code == 200
    file_before = (settings.data_dir / "project.json").read_bytes()

    mutate, loc, code, message = _mutations(media)[rule]
    bad = _valid_project(media)
    mutate(bad)
    res = client.put("/api/project", json=bad)

    assert res.status_code == 422, res.text
    issues = _issues(res.json()["detail"])
    matching = [i for i in issues if i["loc"] == loc]
    assert matching, issues
    assert matching[0]["code"] == code
    if message is not None:
        assert matching[0]["message"] == message
    assert client.get("/api/project").json() == previous
    assert (settings.data_dir / "project.json").read_bytes() == file_before


def test_rule_violation_while_parsing_carries_code_and_params(client: TestClient) -> None:
    media = _upload(client, 2)
    bad = _valid_project(media)
    bad["slides"][2]["transitionIn"]["duration"] = 9
    [issue] = client.put("/api/project", json=bad).json()["detail"]
    assert issue["loc"] == ["body", "slides", 2, "image", "transitionIn", "duration"]
    assert issue["type"] == "project.transitionDuration.outOfRange"
    assert issue["ctx"] == {"min": 0.25, "max": 5.0, "value": 9.0}
    assert issue["msg"] == "The transition duration must be between 0.25 and 5 s (is 9 s)."


def test_reference_errors_are_collected_as_project_invalid(client: TestClient) -> None:
    media = _upload(client, 2)
    bad = _valid_project(media)
    bad["slides"][0]["transitionIn"] = {"transitionId": "fade", "duration": 1.0}
    bad["slides"][1]["mediaId"] = "f" * 32
    detail = client.put("/api/project", json=bad).json()["detail"]
    first = "Slide 1 (ID “a”): the first slide cannot have an incoming transition."
    second = f"Slide 2 (ID “b”): unknown media item “{'f' * 32}”."
    assert detail == {
        "code": "project.invalid",
        "params": {"count": 2, "summary": f"{first} {second}"},
        "message": f"The project is invalid: {first} {second}",
        "issues": [
            {
                "code": "project.slide.firstHasTransition",
                "params": {"slide": 1, "slideId": "a"},
                "message": first,
                "loc": ["body", "slides", 0, "transitionIn"],
            },
            {
                "code": "project.slide.unknownMedia",
                "params": {"slide": 2, "slideId": "b", "mediaId": "f" * 32},
                "message": second,
                "loc": ["body", "slides", 1, "mediaId"],
            },
        ],
    }


def test_invalid_put_without_previous_project_writes_nothing(
    client: TestClient, settings: Settings
) -> None:
    bad = {"schemaVersion": 5, "slides": [_slide("a", "missing")], "music": []}
    assert client.put("/api/project", json=bad).status_code == 422
    assert client.get("/api/project").json() == EMPTY
    assert not (settings.data_dir / "project.json").exists()


def test_corrupt_file_serves_empty_and_is_kept_until_next_save(settings: Settings) -> None:
    settings.data_dir.mkdir(parents=True)
    corrupt = settings.data_dir / "project.json"
    corrupt.write_text("{not json")
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/project").json() == EMPTY
        assert corrupt.read_text() == "{not json"

        project = _valid_project(_upload(client, 2))
        assert client.put("/api/project", json=project).status_code == 200

    backups = list(settings.data_dir.glob("project.json.corrupt-*"))
    assert [b.read_text() for b in backups] == ["{not json"]
    assert json.loads(corrupt.read_text()) == project


@pytest.mark.parametrize(
    ("value", "expected"),
    [(0.5, True), (2.75, True), (60.0, True), (1.3, False), (0.1 + 0.15, True), (2.1, False)],
)
def test_on_grid(value: float, expected: bool) -> None:
    assert on_grid(value) is expected


def test_remove_media_cascades_and_clears_new_first_transition(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        a, b, c = _upload(client, 3)
        project = {
            "schemaVersion": 5,
            "slides": [
                _slide("s1", a, 5.0),
                _slide("s2", b, 4.0, ("fade", 1.0)),
                _slide("s3", a, 3.0, ("dissolve", 2.0)),
                _slide("s4", c, 2.0, ("fade", 0.5)),
            ],
            "music": [],
        }
        assert client.put("/api/project", json=project).status_code == 200
        store: ProjectStore = client.app.state.project  # type: ignore[attr-defined]

        updated = asyncio.run(store.remove_media(a))

        expected = {
            "schemaVersion": 5,
            "slides": [
                _slide("s2", b, 4.0),
                _slide("s4", c, 2.0, ("fade", 0.5)),
            ],
            "music": [],
        }
        assert updated.model_dump(mode="json") == expected
        assert client.get("/api/project").json() == expected

    assert ProjectStore(settings.data_dir).get().model_dump(mode="json") == expected


def test_remove_unused_media_does_not_write(settings: Settings) -> None:
    store = ProjectStore(settings.data_dir)
    result = asyncio.run(store.remove_media("f" * 32))
    assert result == Project(schema_version=5, slides=[], music=[])
    assert not (settings.data_dir / "project.json").exists()


def test_openapi_documents_project_endpoints(client: TestClient) -> None:
    spec = client.get("/openapi.json").json()
    assert set(spec["paths"]["/api/project"]) == {"get", "put"}
    schemas = spec["components"]["schemas"]
    slide = schemas["Slide"]
    assert slide["discriminator"]["propertyName"] == "kind"
    assert set(slide["discriminator"]["mapping"]) == {"image", "video", "title"}
    image_slide = schemas["ImageSlide"]
    assert image_slide["required"] == [
        "kind",
        "id",
        "mediaId",
        "duration",
        "effectId",
        "title",
        "transitionIn",
    ]
    assert image_slide["properties"]["duration"]["minimum"] == 0.5
    assert image_slide["properties"]["duration"]["multipleOf"] == 0.25
    video_slide = schemas["VideoSlide"]
    assert video_slide["required"] == [
        "kind",
        "id",
        "mediaId",
        "trimIn",
        "trimOut",
        "effectId",
        "title",
        "transitionIn",
    ]
    assert video_slide["properties"]["trimIn"]["minimum"] == 0
    assert video_slide["properties"]["trimOut"]["minimum"] == 0


# --- Video slides: mixed projects, migration from version 2, trim rejections --------------


def test_mixed_image_and_video_project_roundtrips(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    [image_id] = _upload(client, 1)
    video_id, duration = _upload_video(client, tmp_path)
    project = _valid_mixed_project(image_id, video_id, duration)

    res = client.put("/api/project", json=project)
    assert res.status_code == 200, res.text
    assert res.json() == project
    assert client.get("/api/project").json() == project
    on_disk = json.loads((settings.data_dir / "project.json").read_text())
    assert on_disk == project


def test_version_2_file_migrates_slides_to_image_kind(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        [image_id] = _upload(client, 1)
    v2_slide = _slide("s1", image_id, 4.5)
    del v2_slide["kind"]
    del v2_slide["effectId"]
    del v2_slide["title"]
    project_file = settings.data_dir / "project.json"
    project_file.write_text(json.dumps({"schemaVersion": 2, "slides": [v2_slide], "music": []}))

    with TestClient(create_app(settings)) as client:
        loaded = client.get("/api/project").json()
        assert loaded == {
            "schemaVersion": 5,
            "slides": [_slide("s1", image_id, 4.5)],
            "music": [],
        }


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("trimIn", -0.5, "The start and end of a video clip must be 0 s or later (is -0.5 s)."),
        ("trimOut", -1.0, "The start and end of a video clip must be 0 s or later (is -1 s)."),
    ],
)
def test_negative_trim_is_rejected_while_parsing(
    client: TestClient, tmp_path: Path, field: str, value: float, message: str
) -> None:
    [image_id] = _upload(client, 1)
    video_id, duration = _upload_video(client, tmp_path)
    bad = _valid_mixed_project(image_id, video_id, duration)
    bad["slides"][1][field] = value
    res = client.put("/api/project", json=bad)
    assert res.status_code == 422, res.text
    [issue] = res.json()["detail"]
    assert issue["loc"] == ["body", "slides", 1, "video", field]
    assert issue["type"] == "project.slideTrim.negative"
    assert issue["msg"] == message


def _video_rejections(image_id: str, video_id: str, duration: float) -> dict[str, Mutation]:
    s = ["body", "slides", 1]
    beyond = duration + 10.0

    def trim_out(value: float) -> Any:
        def mutate(p: dict[str, Any]) -> None:
            p["slides"][1]["trimOut"] = value

        return mutate

    def video_slide_references_image(p: dict[str, Any]) -> None:
        p["slides"][1]["mediaId"] = image_id

    def image_slide_references_video(p: dict[str, Any]) -> None:
        p["slides"][0]["mediaId"] = video_id

    return {
        "trim_out_not_after_trim_in": (
            trim_out(0.0),
            [*s, "trimIn"],
            "project.slide.trimInNotBeforeTrimOut",
            "Slide 2 (ID “b”): the start (0 s) must lie before the end (0 s).",
        ),
        "trim_out_beyond_file": (
            trim_out(beyond),
            [*s, "trimOut"],
            "project.slide.trimOutBeyondFile",
            f"Slide 2 (ID “b”): the end ({beyond:g} s) lies beyond the end "
            f"of the video ({duration:g} s).",
        ),
        "video_slide_references_image": (
            video_slide_references_image,
            [*s, "mediaId"],
            "project.slide.notVideo",
            f"Slide 2 (ID “b”): media item “{image_id}” is not a video.",
        ),
        "image_slide_references_video": (
            image_slide_references_video,
            ["body", "slides", 0, "mediaId"],
            "project.slide.notImage",
            f"Slide 1 (ID “a”): media item “{video_id}” is not an image.",
        ),
    }


VIDEO_RULES = list(_video_rejections("x", "y", 4.0))


@pytest.mark.parametrize("rule", VIDEO_RULES)
def test_invalid_video_slide_is_rejected_and_keeps_previous_project(
    client: TestClient, settings: Settings, tmp_path: Path, rule: str
) -> None:
    [image_id] = _upload(client, 1)
    video_id, duration = _upload_video(client, tmp_path)
    previous = _valid_mixed_project(image_id, video_id, duration)
    assert client.put("/api/project", json=previous).status_code == 200
    file_before = (settings.data_dir / "project.json").read_bytes()

    mutate, loc, code, message = _video_rejections(image_id, video_id, duration)[rule]
    bad = _valid_mixed_project(image_id, video_id, duration)
    mutate(bad)
    res = client.put("/api/project", json=bad)

    assert res.status_code == 422, res.text
    issues = _issues(res.json()["detail"])
    matching = [i for i in issues if i["loc"] == loc]
    assert matching, issues
    assert matching[0]["code"] == code
    assert matching[0]["message"] == message
    assert client.get("/api/project").json() == previous
    assert (settings.data_dir / "project.json").read_bytes() == file_before


# --- Effects: effectId per element, version-4 migration (TASK-API-019) -------------------


def _effect_project(image_id: str, video_id: str, duration: float) -> dict[str, Any]:
    """Mixed project, each kind once with and once without an effect (design.md D3)."""
    return {
        "schemaVersion": 5,
        "slides": [
            _slide("a", image_id, 5.0, effect="sepia"),
            _slide("b", image_id, 2.5, ("fade", 1.0)),
            _video_slide("c", video_id, 0.0, duration, ("fade", 1.0), effect="film-grain"),
            _video_slide("d", video_id, 0.0, duration, ("fade", 1.0)),
        ],
        "music": [],
    }


def test_mixed_project_with_and_without_effects_roundtrips(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    [image_id] = _upload(client, 1)
    video_id, duration = _upload_video(client, tmp_path)
    project = _effect_project(image_id, video_id, duration)

    res = client.put("/api/project", json=project)
    assert res.status_code == 200, res.text
    assert res.json() == project
    assert client.get("/api/project").json() == project
    assert json.loads((settings.data_dir / "project.json").read_text()) == project


@pytest.mark.parametrize("index", [0, 2])
def test_unknown_effect_id_is_rejected_and_keeps_previous_project(
    client: TestClient, settings: Settings, tmp_path: Path, index: int
) -> None:
    """An effect ID outside the catalog is a reference error, for either slide kind."""
    [image_id] = _upload(client, 1)
    video_id, duration = _upload_video(client, tmp_path)
    previous = _effect_project(image_id, video_id, duration)
    assert client.put("/api/project", json=previous).status_code == 200
    file_before = (settings.data_dir / "project.json").read_bytes()

    bad = _effect_project(image_id, video_id, duration)
    bad["slides"][index]["effectId"] = "gibt-es-nicht"
    res = client.put("/api/project", json=bad)

    assert res.status_code == 422, res.text
    slide_id = previous["slides"][index]["id"]
    assert _issues(res.json()["detail"]) == [
        {
            "code": "project.slide.unknownEffect",
            "params": {
                "slide": index + 1,
                "slideId": slide_id,
                "effectId": "gibt-es-nicht",
            },
            "message": (f"Slide {index + 1} (ID “{slide_id}”): unknown effect “gibt-es-nicht”."),
            "loc": ["body", "slides", index, "effectId"],
        }
    ]
    assert client.get("/api/project").json() == previous
    assert (settings.data_dir / "project.json").read_bytes() == file_before


def test_effect_id_must_be_a_string_or_null(client: TestClient) -> None:
    media = _upload(client, 2)
    bad = _valid_project(media)
    bad["slides"][0]["effectId"] = 7
    res = client.put("/api/project", json=bad)
    assert res.status_code == 422
    assert any(i["loc"][:4] == ["body", "slides", 0, "image"] for i in res.json()["detail"])


def test_version_3_file_gets_a_null_effect_on_every_slide(
    settings: Settings, tmp_path: Path
) -> None:
    """A stored version-3 project (before effects) loads at the current version
    with `effectId: null` on image and video elements alike, and is written at
    the current version on the next save."""
    with TestClient(create_app(settings)) as client:
        [image_id] = _upload(client, 1)
        video_id, duration = _upload_video(client, tmp_path)
    v3_slides = [_slide("a", image_id, 5.0), _video_slide("b", video_id, 0.0, duration)]
    for slide in v3_slides:
        del slide["effectId"]
        del slide["title"]
    v3 = {"schemaVersion": 3, "slides": v3_slides, "music": []}
    project_file = settings.data_dir / "project.json"
    project_file.write_text(json.dumps(v3))

    with TestClient(create_app(settings)) as client:
        loaded = client.get("/api/project").json()
        assert loaded == {
            "schemaVersion": 5,
            "slides": [_slide("a", image_id, 5.0), _video_slide("b", video_id, 0.0, duration)],
            "music": [],
        }
        # Loading alone does not rewrite the file (and keeps no backup).
        assert json.loads(project_file.read_text()) == v3
        assert not list(settings.data_dir.glob("project.json.corrupt-*"))

        assert client.put("/api/project", json=loaded).status_code == 200

    assert json.loads(project_file.read_text()) == loaded
