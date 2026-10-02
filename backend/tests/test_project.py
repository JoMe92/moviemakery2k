"""GET/PUT /api/project: Speichern, Laden, Ablehnungsregeln, Kaskade (TASK-API-004)."""

import asyncio
import io
import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from mmy_backend.config import Settings
from mmy_backend.main import create_app
from mmy_backend.project import Project, ProjectStore, on_grid

EMPTY = {"schemaVersion": 1, "slides": []}


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def _upload(client: TestClient, count: int) -> list[str]:
    files = []
    for i in range(count):
        buf = io.BytesIO()
        Image.new("RGB", (8, 6), (i * 40, 10, 10)).save(buf, "PNG")
        files.append(("files", (f"bild{i}.png", buf.getvalue(), "image/png")))
    res = client.post("/api/media", files=files)
    assert res.status_code == 200, res.text
    return [r["item"]["id"] for r in res.json()["items"]]


def _slide(
    slide_id: str,
    media_id: str,
    duration: float = 5.0,
    transition: tuple[str, float] | None = None,
) -> dict[str, Any]:
    return {
        "id": slide_id,
        "mediaId": media_id,
        "duration": duration,
        "transitionIn": (
            None
            if transition is None
            else {"transitionId": transition[0], "duration": transition[1]}
        ),
    }


def _valid_project(media: list[str]) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "slides": [
            _slide("a", media[0], 5.0),
            _slide("b", media[1], 2.75, ("fade", 1.25)),
            _slide("c", media[0], 60, ("dissolve", 5)),
            _slide("d", media[1], 0.5, ("fade", 0.25)),
            _slide("e", media[0], 3.0),
        ],
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
        p["schemaVersion"] = 2

    def too_many(p: dict[str, Any]) -> None:
        p["slides"] = [_slide(f"s{i}", media[0]) for i in range(1001)]

    s = ["body", "slides"]
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
            [*s, 1, "duration"],
            "project.slideDuration.outOfRange",
            slide_range.format("0.25"),
        ),
        "slide_too_long": (
            slide_field(1, "duration", 60.25),
            [*s, 1, "duration"],
            "project.slideDuration.outOfRange",
            slide_range.format("60.25"),
        ),
        "slide_off_grid": (
            slide_field(1, "duration", 2.1),
            [*s, 1, "duration"],
            "project.slideDuration.offGrid",
            "The slide duration must be a multiple of 0.25 s (is 2.1 s).",
        ),
        "slide_bool": (slide_field(1, "duration", True), [*s, 1, "duration"], "float_type", None),
        "transition_too_short": (
            transition_field(2, "duration", 0),
            [*s, 2, "transitionIn", "duration"],
            "project.transitionDuration.outOfRange",
            transition_range.format("0"),
        ),
        "transition_too_long": (
            transition_field(2, "duration", 5.25),
            [*s, 2, "transitionIn", "duration"],
            "project.transitionDuration.outOfRange",
            transition_range.format("5.25"),
        ),
        "transition_off_grid": (
            transition_field(2, "duration", 1.3),
            [*s, 2, "transitionIn", "duration"],
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
            [*s, 0, "id"],
            "string_pattern_mismatch",
            None,
        ),
        "extra_project_field": (extra_project_field, ["body", "title"], "extra_forbidden", None),
        "extra_slide_field": (extra_slide_field, [*s, 1, "effect"], "extra_forbidden", None),
        "missing_transition_in": (
            lambda p: p["slides"][4].pop("transitionIn"),
            [*s, 4, "transitionIn"],
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
    assert issue["loc"] == ["body", "slides", 2, "transitionIn", "duration"]
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
    bad = {"schemaVersion": 1, "slides": [_slide("a", "missing")]}
    assert client.put("/api/project", json=bad).status_code == 422
    assert client.get("/api/project").json() == EMPTY
    assert not (settings.data_dir / "project.json").exists()


def test_corrupt_file_serves_empty_and_is_kept_until_next_save(settings: Settings) -> None:
    settings.data_dir.mkdir(parents=True)
    corrupt = settings.data_dir / "project.json"
    corrupt.write_text("{nicht json")
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/project").json() == EMPTY
        assert corrupt.read_text() == "{nicht json"

        project = _valid_project(_upload(client, 2))
        assert client.put("/api/project", json=project).status_code == 200

    backups = list(settings.data_dir.glob("project.json.corrupt-*"))
    assert [b.read_text() for b in backups] == ["{nicht json"]
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
            "schemaVersion": 1,
            "slides": [
                _slide("s1", a, 5.0),
                _slide("s2", b, 4.0, ("fade", 1.0)),
                _slide("s3", a, 3.0, ("dissolve", 2.0)),
                _slide("s4", c, 2.0, ("fade", 0.5)),
            ],
        }
        assert client.put("/api/project", json=project).status_code == 200
        store: ProjectStore = client.app.state.project  # type: ignore[attr-defined]

        updated = asyncio.run(store.remove_media(a))

        expected = {
            "schemaVersion": 1,
            "slides": [
                _slide("s2", b, 4.0),
                _slide("s4", c, 2.0, ("fade", 0.5)),
            ],
        }
        assert updated.model_dump(mode="json") == expected
        assert client.get("/api/project").json() == expected

    assert ProjectStore(settings.data_dir).get().model_dump(mode="json") == expected


def test_remove_unused_media_does_not_write(settings: Settings) -> None:
    store = ProjectStore(settings.data_dir)
    result = asyncio.run(store.remove_media("f" * 32))
    assert result == Project(schema_version=1, slides=[])
    assert not (settings.data_dir / "project.json").exists()


def test_openapi_documents_project_endpoints(client: TestClient) -> None:
    spec = client.get("/openapi.json").json()
    assert set(spec["paths"]["/api/project"]) == {"get", "put"}
    slide = spec["components"]["schemas"]["Slide"]
    assert slide["required"] == ["id", "mediaId", "duration", "transitionIn"]
    assert slide["properties"]["duration"]["minimum"] == 0.5
    assert slide["properties"]["duration"]["multipleOf"] == 0.25
