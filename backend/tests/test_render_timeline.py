"""Python time model against the shared test vectors (TASK-RENDER-001, design.md D3).

`apps/web/src/timeline/timelineVectors.test.ts` checks the same file; the
comparison here follows the same rule: numbers within the file's absolute
tolerance, strings/null/object keys exactly, lists of equal length and order.
"""

import json
from typing import Any

import pytest

from mmy_backend.config import REPO_ROOT
from mmy_backend.project import Project, Slide, TransitionRef
from mmy_backend.render.timeline import (
    EmptyFrame,
    Frame,
    Segment,
    StillFrame,
    StillSegment,
    TimelineSlide,
    TransitionFrame,
    TransitionIn,
    build_timeline,
    effective_transition,
    frame_at,
    frame_count,
    frame_time,
    slide_index_at,
    slide_start_time,
    timeline_slides_from_project,
)

VECTORS_FILE = REPO_ROOT / "packages" / "fixtures" / "timeline-vectors.json"
VECTORS: dict[str, Any] = json.loads(VECTORS_FILE.read_text(encoding="utf-8"))
TOLERANCE: float = VECTORS["tolerance"]
CASES: list[dict[str, Any]] = VECTORS["cases"]


def diff(actual: Any, expected: Any, path: str = "$") -> list[str]:
    """Recursive comparison as in the Vitest test; empty list = equal."""
    if isinstance(expected, int | float) and not isinstance(expected, bool):
        ok = (
            isinstance(actual, int | float)
            and not isinstance(actual, bool)
            and abs(actual - expected) <= TOLERANCE
        )
        return [] if ok else [f"{path}: expected {expected}, got {json.dumps(actual)}"]
    if isinstance(expected, list):
        if not isinstance(actual, list):
            return [f"{path}: expected array, got {json.dumps(actual)}"]
        out = (
            []
            if len(actual) == len(expected)
            else [f"{path}: expected length {len(expected)}, got {len(actual)}"]
        )
        for i, e in enumerate(expected):
            out += diff(actual[i] if i < len(actual) else None, e, f"{path}[{i}]")
        return out
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return [f"{path}: expected object, got {json.dumps(actual)}"]
        out = []
        for key in [*expected, *(k for k in actual if k not in expected)]:
            if key in expected:
                out += diff(actual.get(key), expected[key], f"{path}.{key}")
            else:
                out.append(f"{path}.{key}: unexpected key")
        return out
    same = type(actual) is type(expected) and actual == expected
    return [] if same else [f"{path}: expected {json.dumps(expected)}, got {json.dumps(actual)}"]


# --- Conversion into the JSON form of the vectors ---------------------------


def slide_from_json(raw: dict[str, Any]) -> TimelineSlide:
    ref = raw["transitionIn"]
    return TimelineSlide(
        id=raw["id"],
        media_id=raw["mediaId"],
        duration=raw["duration"],
        transition_in=(
            None
            if ref is None
            else TransitionIn(transition_id=ref["transitionId"], duration=ref["duration"])
        ),
    )


def segment_json(seg: Segment) -> dict[str, Any]:
    if isinstance(seg, StillSegment):
        return {"kind": "still", "slideIndex": seg.slide_index, "start": seg.start, "end": seg.end}
    return {
        "kind": "transition",
        "fromIndex": seg.from_index,
        "toIndex": seg.to_index,
        "transitionId": seg.transition_id,
        "start": seg.start,
        "end": seg.end,
    }


def frame_json(frame: Frame) -> dict[str, Any]:
    match frame:
        case EmptyFrame():
            return {"kind": "empty"}
        case StillFrame():
            return {"kind": "still", "slideIndex": frame.slide_index}
        case TransitionFrame():
            return {
                "kind": "transition",
                "fromIndex": frame.from_index,
                "toIndex": frame.to_index,
                "transitionId": frame.transition_id,
                "progress": frame.progress,
            }


# --- Vectors ----------------------------------------------------------------


def test_vector_file_has_version_1_unique_names_and_required_cases() -> None:
    assert VECTORS["version"] == 1
    names = [c["name"] for c in CASES]
    assert len(set(names)) == len(names)
    assert len(CASES) >= 5


def test_diff_detects_deviations_above_tolerance() -> None:
    assert diff({"a": [1, "x"]}, {"a": [1 + TOLERANCE / 2, "x"]}) == []
    assert len(diff({"a": [1.001, "x"]}, {"a": [1, "x"]})) == 1
    assert len(diff({"kind": "still"}, {"kind": "transition"})) == 1
    assert len(diff({"a": 1, "b": 2}, {"a": 1})) == 1
    assert len(diff({"a": 1}, {"a": 1, "b": 2})) == 1
    assert len(diff([1], [1, 2])) == 2


@pytest.fixture(params=CASES, ids=[c["name"] for c in CASES])
def case(request: pytest.FixtureRequest) -> dict[str, Any]:
    result: dict[str, Any] = request.param
    return result


def test_total_duration(case: dict[str, Any]) -> None:
    tl = build_timeline([slide_from_json(s) for s in case["slides"]])
    assert diff(tl.duration, case["expected"]["totalDuration"]) == []


def test_placed_slides(case: dict[str, Any]) -> None:
    tl = build_timeline([slide_from_json(s) for s in case["slides"]])
    placed = [
        {"index": p.index, "start": p.start, "end": p.end, "transitionIn": p.transition_in}
        for p in tl.slides
    ]
    assert diff(placed, case["expected"]["placed"]) == []
    assert [p.slide for p in tl.slides] == [slide_from_json(s) for s in case["slides"]]


def test_segments(case: dict[str, Any]) -> None:
    tl = build_timeline([slide_from_json(s) for s in case["slides"]])
    assert diff([segment_json(s) for s in tl.segments], case["expected"]["segments"]) == []


def test_samples(case: dict[str, Any]) -> None:
    tl = build_timeline([slide_from_json(s) for s in case["slides"]])
    problems = [
        f"t={sample['t']}: {d}"
        for sample in case["expected"]["samples"]
        for d in diff(frame_json(frame_at(tl, sample["t"])), sample["frame"])
    ]
    assert problems == []


# --- Further functions ------------------------------------------------------


def test_effective_transition_is_clamped_to_half_of_both_slides() -> None:
    assert effective_transition(1.25, 5, 5) == 1.25
    assert effective_transition(5, 4, 6) == 2
    assert effective_transition(5, 6, 1) == 0.5
    assert effective_transition(-1, 5, 5) == 0


def test_slide_index_at_and_slide_start_time() -> None:
    slides = [slide_from_json(s) for s in CASES[0]["slides"]]  # spec-total-duration-12.50
    tl = build_timeline(slides)
    assert slide_index_at(tl, 2) == 0
    assert slide_index_at(tl, 4) == 1  # during a transition the target slide counts
    assert slide_index_at(tl, 99) == 2
    assert slide_index_at(build_timeline([]), 1) is None
    assert slide_start_time(tl, 0) == 0
    assert slide_start_time(tl, 1) == 5
    assert slide_start_time(tl, 2) == 8.75
    assert slide_start_time(tl, 3) == 0
    assert slide_start_time(tl, -1) == 0


@pytest.mark.parametrize(
    ("total", "fps", "expected"),
    [
        (12.5, 30, 375),
        (0.0, 30, 0),
        (-1.0, 30, 0),
        (5.0, 30, 150),
        (5.01, 30, 151),
        (0.25, 30, 8),  # 7.5 -> 8: the last, partial frame counts
        (0.1 + 0.2, 10, 3),  # 3.0000000000000004 is a rounding error, not 4
        (1 / 3, 3, 1),
        (10.0, 30000 / 1001, 300),  # 299.7 -> 300
        (float("inf"), 30, 0),
        (float("nan"), 30, 0),
    ],
)
def test_frame_count(total: float, fps: float, expected: int) -> None:
    assert frame_count(total, fps) == expected


def test_frame_time_is_n_over_fps_and_last_frame_is_inside_movie() -> None:
    assert frame_time(0, 30) == 0
    assert frame_time(15, 30) == 0.5
    n = frame_count(12.5, 30)
    assert frame_time(n - 1, 30) < 12.5 <= frame_time(n, 30)


def test_timeline_slides_from_project() -> None:
    project = Project(
        schema_version=1,
        slides=[
            Slide(id="a", media_id="m-a", duration=5, transition_in=None),
            Slide(
                id="b",
                media_id="m-b",
                duration=2.5,
                transition_in=TransitionRef(transition_id="fade", duration=1.25),
            ),
        ],
    )
    slides = timeline_slides_from_project(project)
    assert slides == (
        TimelineSlide(id="a", media_id="m-a", duration=5, transition_in=None),
        TimelineSlide(
            id="b",
            media_id="m-b",
            duration=2.5,
            transition_in=TransitionIn(transition_id="fade", duration=1.25),
        ),
    )
    tl = build_timeline(slides)
    assert tl.duration == 6.25
    assert frame_at(tl, 4.375) == TransitionFrame(
        from_index=0, to_index=1, transition_id="fade", progress=0.5
    )
    assert timeline_slides_from_project(Project(schema_version=1, slides=[])) == ()
