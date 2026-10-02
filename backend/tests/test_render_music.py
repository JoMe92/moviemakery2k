"""Python music schedule against the shared test vectors (TASK-CAT-004, design.md D4).

`apps/web/src/timeline/musicVectors.test.ts` checks the same file with the same
comparison rule: numbers within the file's absolute tolerance, strings/null/
object keys exactly, lists of equal length and order.
"""

import json
import math
from typing import Any

import pytest

from mmy_backend.config import REPO_ROOT
from mmy_backend.render.music import (
    MusicClipInput,
    MusicSegment,
    music_duration,
    music_schedule,
)

VECTORS_FILE = REPO_ROOT / "packages" / "fixtures" / "music-vectors.json"
VECTORS: dict[str, Any] = json.loads(VECTORS_FILE.read_text(encoding="utf-8"))
TOLERANCE: float = VECTORS["tolerance"]
CASES: list[dict[str, Any]] = VECTORS["cases"]
REQUIRED_CASES = {
    "spec-two-clips-sequential",
    "spec-trimmed-clip",
    "spec-cut-at-movie-end-with-fade",
    "movie-shorter-than-1s",
    "spec-silence-after-music",
}


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


def clip_from_json(raw: dict[str, Any]) -> MusicClipInput:
    return MusicClipInput(
        id=raw["id"],
        media_id=raw["mediaId"],
        trim_start=raw["trimStart"],
        trim_end=raw["trimEnd"],
        volume=raw["volume"],
        fade_in=raw["fadeIn"],
        fade_out=raw["fadeOut"],
    )


def segment_json(seg: MusicSegment) -> dict[str, Any]:
    return {
        "mediaId": seg.media_id,
        "at": seg.at,
        "sourceIn": seg.source_in,
        "length": seg.length,
        "gain": seg.gain,
        "fadeIn": seg.fade_in,
        "fadeOut": seg.fade_out,
    }


def test_vector_file_has_version_1_unique_names_and_required_cases() -> None:
    assert VECTORS["version"] == 1
    names = [c["name"] for c in CASES]
    assert len(set(names)) == len(names)
    assert set(names) >= REQUIRED_CASES


def test_diff_detects_deviations_above_tolerance() -> None:
    assert diff({"a": [1, "x"]}, {"a": [1 + TOLERANCE / 2, "x"]}) == []
    assert len(diff({"a": [1.001, "x"]}, {"a": [1, "x"]})) == 1
    assert len(diff({"a": 1, "b": 2}, {"a": 1})) == 1


@pytest.fixture(params=CASES, ids=[c["name"] for c in CASES])
def case(request: pytest.FixtureRequest) -> dict[str, Any]:
    result: dict[str, Any] = request.param
    return result


def test_music_duration(case: dict[str, Any]) -> None:
    clips = [clip_from_json(c) for c in case["clips"]]
    assert (
        diff(music_duration(clips, case["mediaDurations"]), case["expected"]["musicDuration"]) == []
    )


def test_segments(case: dict[str, Any]) -> None:
    clips = [clip_from_json(c) for c in case["clips"]]
    segments = music_schedule(clips, case["mediaDurations"], case["movieDuration"])
    assert diff([segment_json(s) for s in segments], case["expected"]["segments"]) == []


@pytest.mark.parametrize("movie", [math.nan, math.inf, -1.0])
def test_non_finite_or_negative_movie_has_no_segments(movie: float) -> None:
    clip = MusicClipInput("a", "m", 0, None, 1, False, False)
    assert music_schedule([clip], {"m": 5}, movie) == ()
