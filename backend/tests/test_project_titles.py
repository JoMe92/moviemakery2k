"""Slide data model version 5: the `title` element kind, the overlay `title`
field and the migration from version 4 (TASK-API-020, add-titles-and-credits
design.md D5, spec slideshow-project/titles-and-credits)."""

import io
import json
from collections.abc import Iterator
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from mmy_backend.api.exports import _check_exportable
from mmy_backend.config import Settings
from mmy_backend.main import create_app
from mmy_backend.media import MediaStore
from mmy_backend.project import (
    MAX_CREDIT_ENTRIES,
    SCHEMA_VERSION,
    TITLE_DURATION_DEFAULT,
    Project,
    ProjectStore,
    migrate_project_data,
)

WHITE = "#ffffff"


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def _upload(client: TestClient, count: int = 1) -> list[str]:
    files = []
    for i in range(count):
        buf = io.BytesIO()
        Image.new("RGB", (8, 6), (i * 40, 10, 10)).save(buf, "PNG")
        files.append(("files", (f"image{i}.png", buf.getvalue(), "image/png")))
    res = client.post("/api/media", files=files)
    assert res.status_code == 200, res.text
    return [r["item"]["id"] for r in res.json()["items"]]


def _image_slide(slide_id: str, media_id: str, **fields: Any) -> dict[str, Any]:
    return {
        "kind": "image",
        "id": slide_id,
        "mediaId": media_id,
        "duration": 5.0,
        "effectId": None,
        "title": None,
        "transitionIn": None,
        **fields,
    }


def _title_slide(slide_id: str = "t1", **fields: Any) -> dict[str, Any]:
    return {
        "kind": "title",
        "id": slide_id,
        "lines": ["Mein Film"],
        "creditEntries": None,
        "styleId": "basic-title",
        "color": WHITE,
        "duration": TITLE_DURATION_DEFAULT,
        "transitionIn": None,
        **fields,
    }


def _overlay(**fields: Any) -> dict[str, Any]:
    return {"lines": ["Untertitel"], "styleId": "subtitle", "color": WHITE, **fields}


def _project(slides: list[dict[str, Any]]) -> dict[str, Any]:
    return {"schemaVersion": SCHEMA_VERSION, "slides": slides, "music": []}


# --- A title element ----------------------------------------------------------


def test_title_element_roundtrips(client: TestClient, settings: Settings) -> None:
    """A freestanding title element refers to no medium and keeps its own duration."""
    [image_id] = _upload(client)
    project = _project([_title_slide(), _image_slide("s1", image_id)])

    res = client.put("/api/project", json=project)
    assert res.status_code == 200, res.text
    assert res.json() == project
    assert client.get("/api/project").json() == project
    assert json.loads((settings.data_dir / "project.json").read_text()) == project


def test_credits_element_roundtrips(client: TestClient) -> None:
    """The `credits` layout carries `creditEntries` instead of `lines`."""
    credits = _title_slide(
        "c1",
        lines=None,
        creditEntries=["Regie: Ich", "Kamera: Auch ich"],
        styleId="scroll-up-stacked",
        duration=10.0,
    )
    res = client.put("/api/project", json=_project([credits]))
    assert res.status_code == 200, res.text
    assert res.json()["slides"][0] == credits


def test_title_element_may_have_an_incoming_transition(client: TestClient) -> None:
    """A transition belongs to the element it fades into, whatever its kind."""
    [image_id] = _upload(client)
    project = _project(
        [
            _image_slide("s1", image_id),
            _title_slide(transitionIn={"transitionId": "fade", "duration": 1.0}),
        ]
    )
    assert client.put("/api/project", json=project).status_code == 200


# --- An overlay title ---------------------------------------------------------


def test_overlay_title_on_an_image_element_roundtrips(client: TestClient) -> None:
    """An overlay title has no duration of its own; it follows its host element."""
    [image_id] = _upload(client)
    project = _project([_image_slide("s1", image_id, title=_overlay())])

    res = client.put("/api/project", json=project)
    assert res.status_code == 200, res.text
    slide = res.json()["slides"][0]
    assert slide["title"] == _overlay()
    assert slide["duration"] == 5.0


# --- Rejections ---------------------------------------------------------------


def test_overlay_title_on_a_title_element_is_rejected(client: TestClient) -> None:
    """A title element must not additionally carry an overlay title: the field
    does not exist on that kind, and the models forbid extra fields."""
    bad = _project([_title_slide(title=_overlay())])
    res = client.put("/api/project", json=bad)
    assert res.status_code == 422
    detail = res.json()["detail"]
    assert any(
        issue["loc"][:4] == ["body", "slides", 0, "title"] and issue["type"] == "extra_forbidden"
        for issue in detail
    ), detail
    assert client.get("/api/project").json()["slides"] == []


@pytest.mark.parametrize(
    ("fields", "code"),
    [
        ({"lines": None}, "project.titleText.missing"),
        ({"creditEntries": ["Regie: Ich"]}, "project.titleText.ambiguous"),
    ],
    ids=["neither", "both"],
)
def test_title_element_needs_exactly_one_text_field(
    client: TestClient, fields: dict[str, Any], code: str
) -> None:
    res = client.put("/api/project", json=_project([_title_slide(**fields)]))
    assert res.status_code == 422
    assert any(issue["type"] == code for issue in res.json()["detail"]), res.text


@pytest.mark.parametrize("place", ["element", "overlay"])
def test_unknown_title_style_is_rejected(client: TestClient, place: str) -> None:
    [image_id] = _upload(client)
    if place == "element":
        slides = [_title_slide(styleId="gibt-es-nicht")]
        loc = ["body", "slides", 0, "styleId"]
    else:
        slides = [_image_slide("s1", image_id, title=_overlay(styleId="gibt-es-nicht"))]
        loc = ["body", "slides", 0, "title", "styleId"]

    res = client.put("/api/project", json=_project(slides))
    assert res.status_code == 422
    body = res.json()["detail"]
    assert body["code"] == "project.invalid"
    assert body["issues"] == [
        {
            "code": "project.slide.unknownTitleStyle",
            "params": {
                "slide": 1,
                "slideId": slides[0]["id"],
                "styleId": "gibt-es-nicht",
            },
            "message": (f"Slide 1 (ID “{slides[0]['id']}”): unknown title style “gibt-es-nicht”."),
            "loc": loc,
        }
    ]
    assert client.get("/api/project").json()["slides"] == []


@pytest.mark.parametrize(
    "fields",
    [
        {"color": "weiß"},
        {"color": "#fff"},
        {"lines": []},
        {"lines": ["a", "b", "c"]},
        {"mediaId": "f" * 32},
        {"effectId": None},
        {"lines": None, "creditEntries": ["x"] * (MAX_CREDIT_ENTRIES + 1)},
    ],
    ids=["colour-name", "short-hex", "no-line", "three-lines", "media-id", "effect-id", "too-many"],
)
def test_structurally_invalid_title_elements_are_rejected(
    client: TestClient, fields: dict[str, Any]
) -> None:
    """Colour format, line counts, and fields a title element does not have."""
    assert client.put("/api/project", json=_project([_title_slide(**fields)])).status_code == 422


def test_title_element_needs_no_medium_to_export(client: TestClient) -> None:
    """The export pre-check must not report `export.missingMedia` for an element
    that refers to no medium at all."""
    project = Project.model_validate(_project([_title_slide()]))
    store = cast(ProjectStore, client.app.state.project)  # type: ignore[attr-defined]
    media = cast(MediaStore, client.app.state.media)  # type: ignore[attr-defined]
    assert store is not None
    _check_exportable(project, media)


# --- Migration from version 4 -------------------------------------------------


def test_migrate_version_4_adds_a_null_title_to_every_slide() -> None:
    v4 = {
        "schemaVersion": 4,
        "slides": [
            {
                "kind": "image",
                "id": "s1",
                "mediaId": "m",
                "duration": 3.0,
                "effectId": None,
                "transitionIn": None,
            },
            {
                "kind": "video",
                "id": "v1",
                "mediaId": "v",
                "trimIn": 0,
                "trimOut": 5,
                "effectId": "sepia",
                "transitionIn": None,
            },
        ],
        "music": [],
    }
    migrated = migrate_project_data(v4)
    assert migrated["schemaVersion"] == SCHEMA_VERSION
    assert [slide["title"] for slide in migrated["slides"]] == [None, None]
    # Everything else stays untouched.
    assert migrated["slides"][1]["effectId"] == "sepia"


def test_migrate_version_4_keeps_an_existing_title() -> None:
    """A version-4 file written by a newer client already carrying `title` is
    never overwritten."""
    overlay = _overlay()
    v4 = {
        "schemaVersion": 4,
        "slides": [
            {
                "kind": "image",
                "id": "s1",
                "mediaId": "m",
                "duration": 3.0,
                "effectId": None,
                "title": overlay,
                "transitionIn": None,
            }
        ],
        "music": [],
    }
    assert migrate_project_data(v4)["slides"][0]["title"] == overlay


def test_version_4_file_loads_at_the_current_version(settings: Settings) -> None:
    """A stored version-4 project loads with `title: null` on every element and
    is written at the current version on the next save (spec slideshow-project)."""
    with TestClient(create_app(settings)) as client:
        [image_id] = _upload(client)
    v4_slide = _image_slide("s1", image_id)
    del v4_slide["title"]
    project_file = settings.data_dir / "project.json"
    v4 = {"schemaVersion": 4, "slides": [v4_slide], "music": []}
    project_file.write_text(json.dumps(v4))

    with TestClient(create_app(settings)) as client:
        loaded = client.get("/api/project").json()
        assert loaded == _project([_image_slide("s1", image_id)])
        # Loading alone does not rewrite the file (and keeps no backup).
        assert json.loads(project_file.read_text()) == v4
        assert not list(settings.data_dir.glob("project.json.corrupt-*"))

        assert client.put("/api/project", json=loaded).status_code == 200

    assert json.loads(project_file.read_text()) == loaded


def test_openapi_documents_the_title_shapes(client: TestClient) -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    assert set(schemas["Slide"]["discriminator"]["mapping"]) == {"image", "video", "title"}
    assert schemas["TitleSlide"]["required"] == [
        "kind",
        "id",
        "lines",
        "creditEntries",
        "styleId",
        "color",
        "duration",
        "transitionIn",
    ]
    assert schemas["TitleOverlay"]["required"] == ["lines", "styleId", "color"]
    assert "title" not in schemas["TitleSlide"]["properties"]
    for kind in ("ImageSlide", "VideoSlide"):
        assert "title" in schemas[kind]["required"]


def test_deleting_an_image_keeps_a_title_element(client: TestClient) -> None:
    """The media cascade must not drop an element that refers to no medium."""
    [image_id] = _upload(client)
    project = _project([_title_slide(), _image_slide("s1", image_id)])
    assert client.put("/api/project", json=project).status_code == 200

    assert client.delete(f"/api/media/{image_id}").status_code == 200
    assert client.get("/api/project").json()["slides"] == [_title_slide()]
