"""Project model and project store (spec slideshow-project "Projektmodell", design.md D3 and D7;
music track: add-music-track design.md D3, spec music-track;
video clips: add-timeline-editing design.md D1, spec slideshow-project).

`<data_dir>/project.json` contains a `Project` with `schemaVersion: 3`. Every
element (slide) is either an **image slide** (`kind: "image"`, a display
`duration`) or a **video slide** (`kind: "video"`, `trimIn`/`trimOut` in
seconds into the referenced video; its length follows only from
`trimOut - trimIn`, there is no separate duration field). Either kind MAY
carry one incoming transition from the previous element; the first element has
none. The music track (`music`) is a list of music clips that play one after
the other from 0; each refers to an audio medium.

A file with `schemaVersion: 1` (written before the music track existed) is
loaded as a version-2 project with an empty music track. A file with
`schemaVersion: 2` (written before video slides existed) is loaded with every
slide as an image slide, its duration unchanged. Either is written at the
current schema version on the next save. The API only accepts the current
schema version.

Validation runs in two stages:

1. Structure (Pydantic): fields, types, ID format, duration ranges and 0.25 s
   grid, music volume and trim values, list lengths.
2. References (`ProjectStore.save`): media and transition IDs exist, image
   slides refer to images, video slides to videos and music clips to audio,
   slide and clip IDs are unique, the first element has no transition, every
   clip's range lies within its file (`0 <= trimStart < end <= duration`,
   played length >= 0.5 s), and every video slide's trim lies within its video
   (`0 <= trimIn < trimOut <= duration`).

Errors of stage 1 are FastAPI's native 422 list; rule violations there carry an
error code as `type` (design.md D5). Errors of stage 2 are `ApiErrorIssue`s,
reported together as `project.invalid` (see `mmy_backend.errors`).

A corrupt `project.json` is not overwritten on load: the backend logs a
warning and returns the empty project. Only on the next successful save is the
old file renamed to `project.json.corrupt-<time>`, so that nothing is silently lost.
"""

import asyncio
import json
import logging
import math
from collections.abc import Collection, Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    Strict,
    ValidationError,
)
from pydantic.alias_generators import to_camel

from mmy_backend.errors import (
    ApiErrorIssue,
    ApiErrorWithIssues,
    ErrorCode,
    Params,
    ParamValue,
    error_message,
    validation_error,
)
from mmy_backend.media import AudioItem, ImageItem, VideoItem
from mmy_backend.storage import write_bytes_atomic

logger = logging.getLogger(__name__)

SCHEMA_VERSION: Literal[3] = 3
MAX_SLIDES = 1000
MAX_MUSIC_CLIPS = 100
MUSIC_VOLUME_MIN = 0.0
MUSIC_VOLUME_MAX = 2.0
MUSIC_CLIP_MIN_LENGTH = 0.5
DURATION_STEP = 0.25
SLIDE_DURATION_MIN = 0.5
SLIDE_DURATION_MAX = 60.0
TRANSITION_DURATION_MIN = 0.25
TRANSITION_DURATION_MAX = 5.0
SLIDE_ID_PATTERN = r"^[A-Za-z0-9_-]{1,64}$"

_GRID_EPSILON = 1e-9
# Tolerance when comparing trim values (music clips, video slides) with the
# (ffprobe) media duration.
_TRIM_EPSILON = 1e-6


def on_grid(value: float, step: float = DURATION_STEP) -> bool:
    """Is `value` on the grid `step` (up to rounding errors)?"""
    steps = value / step
    return abs(steps - round(steps)) <= _GRID_EPSILON


def _duration_check(kind: str, low: float, high: float) -> AfterValidator:
    """Range and grid check; `kind` is the code prefix, e.g. `project.slideDuration`."""

    def check(value: float) -> float:
        if not math.isfinite(value) or not low <= value <= high:
            raise validation_error(f"{kind}.outOfRange", min=low, max=high, value=value)
        if not on_grid(value):
            raise validation_error(f"{kind}.offGrid", step=DURATION_STEP, value=value)
        return value

    return AfterValidator(check)


def _duration_schema(low: float, high: float) -> dict[str, Any]:
    return {"minimum": low, "maximum": high, "multipleOf": DURATION_STEP}


# Strict: JSON numbers (including integers) yes, booleans and strings no.
SlideDuration = Annotated[
    float,
    Strict(),
    _duration_check("project.slideDuration", SLIDE_DURATION_MIN, SLIDE_DURATION_MAX),
    Field(
        description="Display duration in seconds",
        json_schema_extra=_duration_schema(SLIDE_DURATION_MIN, SLIDE_DURATION_MAX),
    ),
]
TransitionDuration = Annotated[
    float,
    Strict(),
    _duration_check("project.transitionDuration", TRANSITION_DURATION_MIN, TRANSITION_DURATION_MAX),
    Field(
        description="Target duration of the transition in seconds",
        json_schema_extra=_duration_schema(TRANSITION_DURATION_MIN, TRANSITION_DURATION_MAX),
    ),
]


def _volume_check(value: float) -> float:
    if not math.isfinite(value) or not MUSIC_VOLUME_MIN <= value <= MUSIC_VOLUME_MAX:
        raise validation_error(
            "project.musicVolume.outOfRange",
            min=MUSIC_VOLUME_MIN,
            max=MUSIC_VOLUME_MAX,
            value=value,
        )
    return value


def _trim_check(value: float) -> float:
    if not math.isfinite(value) or value < 0:
        raise validation_error("project.musicTrim.negative", value=value)
    return value


def _slide_trim_check(value: float) -> float:
    if not math.isfinite(value) or value < 0:
        raise validation_error("project.slideTrim.negative", value=value)
    return value


MusicVolume = Annotated[
    float,
    Strict(),
    AfterValidator(_volume_check),
    Field(
        description="Volume as linear gain (1 = 100 %, new clip: 1)",
        json_schema_extra={"minimum": MUSIC_VOLUME_MIN, "maximum": MUSIC_VOLUME_MAX},
    ),
]
TrimTime = Annotated[
    float, Strict(), AfterValidator(_trim_check), Field(json_schema_extra={"minimum": 0})
]
SlideTrimTime = Annotated[
    float, Strict(), AfterValidator(_slide_trim_check), Field(json_schema_extra={"minimum": 0})
]


class _ProjectModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


class TransitionRef(_ProjectModel):
    transition_id: str = Field(description="ID from the transition catalog")
    duration: TransitionDuration


class ImageSlide(_ProjectModel):
    kind: Literal["image"]
    id: Annotated[
        str,
        Field(
            pattern=SLIDE_ID_PATTERN,
            description="Assigned by the client, unique within the project",
        ),
    ]
    media_id: str = Field(description="ID of an image from /api/media")
    duration: SlideDuration
    transition_in: TransitionRef | None = Field(
        description="Incoming transition from the previous element; always null for the first"
    )


class VideoSlide(_ProjectModel):
    """A video clip element (add-timeline-editing design.md D1); its length is
    always `trimOut - trimIn`, there is no separate duration field."""

    kind: Literal["video"]
    id: Annotated[
        str,
        Field(
            pattern=SLIDE_ID_PATTERN,
            description="Assigned by the client, unique within the project",
        ),
    ]
    media_id: str = Field(description="ID of a video from /api/media")
    trim_in: SlideTrimTime = Field(description="Start within the video in seconds (new clip: 0)")
    trim_out: SlideTrimTime = Field(
        description="End within the video in seconds (new clip: the video's full duration)"
    )
    transition_in: TransitionRef | None = Field(
        description="Incoming transition from the previous element; always null for the first"
    )


type Slide = Annotated[ImageSlide | VideoSlide, Field(discriminator="kind")]
"""A storyboard element; `kind` tells whether it is an image or a video clip."""


class MusicClip(_ProjectModel):
    """A piece of the music track (add-music-track design.md D3); no start time:
    clips play one after the other from 0."""

    id: Annotated[
        str,
        Field(
            pattern=SLIDE_ID_PATTERN,
            description="Assigned by the client, unique within the music track",
        ),
    ]
    media_id: str = Field(description="ID of an audio medium from /api/media")
    trim_start: TrimTime = Field(description="Start within the file in seconds (new clip: 0)")
    trim_end: TrimTime | None = Field(
        description="End within the file in seconds; null = end of the file (new clip: null)"
    )
    volume: MusicVolume
    fade_in: Annotated[bool, Strict()] = Field(description="Fade in over 1 s (new clip: false)")
    fade_out: Annotated[bool, Strict()] = Field(description="Fade out over 1 s (new clip: false)")


class Project(_ProjectModel):
    schema_version: Literal[3]
    slides: Annotated[list[Slide], Field(max_length=MAX_SLIDES)]
    music: Annotated[list[MusicClip], Field(max_length=MAX_MUSIC_CLIPS)]


def empty_project() -> Project:
    return Project(schema_version=SCHEMA_VERSION, slides=[], music=[])


def migrate_project_data(raw: Any) -> Any:
    """Raises a stored project to the current schema version.

    Version 1 (before the music track) becomes version 2 with an empty music
    track. Version 2 (and the version-2 shape just produced from version 1)
    has no `kind` on its slides; each becomes `kind: "image"` with its
    duration unchanged. Anything else is returned unchanged and validated as is.
    """
    if not isinstance(raw, dict):
        return raw
    version = raw.get("schemaVersion")
    if version == 1 and "music" not in raw:
        raw = {**raw, "schemaVersion": 2, "music": []}
        version = 2
    if version != 2:
        return raw
    slides = raw.get("slides")
    if not isinstance(slides, list):
        return raw
    migrated_slides = [
        {"kind": "image", **slide} if isinstance(slide, dict) and "kind" not in slide else slide
        for slide in slides
    ]
    return {**raw, "schemaVersion": SCHEMA_VERSION, "slides": migrated_slides}


# --- Reference checks --------------------------------------------------------


class ProjectValidationError(Exception):
    """The project refers to something unknown or breaks a rule."""

    def __init__(self, issues: list[ApiErrorIssue]) -> None:
        super().__init__(" ".join(issue.message for issue in issues))
        self.issues = issues

    def api_error(self) -> ApiErrorWithIssues:
        """The `project.invalid` error collecting all issues."""
        params: Params = {"count": len(self.issues), "summary": str(self)}
        return ApiErrorWithIssues(
            code=ErrorCode.PROJECT_INVALID,
            params=params,
            message=error_message(ErrorCode.PROJECT_INVALID, params),
            issues=self.issues,
        )


def _issue(
    loc: tuple[str | int, ...], code: ErrorCode | str, **params: ParamValue
) -> ApiErrorIssue:
    return ApiErrorIssue(
        code=ErrorCode(code), params=params, message=error_message(code, params), loc=["body", *loc]
    )


def check_references(
    project: Project,
    media: Iterable[ImageItem | AudioItem | VideoItem],
    transition_ids: Collection[str],
) -> list[ApiErrorIssue]:
    """Checks the references of a structurally valid project; empty list = valid."""
    items = {item.id: item for item in media}
    issues = _check_slides(project, items, transition_ids)
    issues.extend(_check_music(project, items))
    return issues


def _check_slides(
    project: Project,
    items: dict[str, ImageItem | AudioItem | VideoItem],
    transition_ids: Collection[str],
) -> list[ApiErrorIssue]:
    issues: list[ApiErrorIssue] = []
    seen: dict[str, int] = {}
    for index, slide in enumerate(project.slides):
        where: Params = {"slide": index + 1, "slideId": slide.id}
        if slide.id in seen:
            issues.append(
                _issue(
                    ("slides", index, "id"),
                    "project.slide.duplicateId",
                    **where,
                    firstSlide=seen[slide.id] + 1,
                )
            )
        else:
            seen[slide.id] = index
        item = items.get(slide.media_id)
        if item is None:
            issues.append(
                _issue(
                    ("slides", index, "mediaId"),
                    "project.slide.unknownMedia",
                    **where,
                    mediaId=slide.media_id,
                )
            )
        elif slide.kind == "image":
            if item.kind != "image":
                issues.append(
                    _issue(
                        ("slides", index, "mediaId"),
                        "project.slide.notImage",
                        **where,
                        mediaId=slide.media_id,
                    )
                )
        elif item.kind != "video":
            issues.append(
                _issue(
                    ("slides", index, "mediaId"),
                    "project.slide.notVideo",
                    **where,
                    mediaId=slide.media_id,
                )
            )
        else:
            trim_issue = _check_slide_trim(index, slide, item.duration, where)
            if trim_issue is not None:
                issues.append(trim_issue)
        transition = slide.transition_in
        if transition is None:
            continue
        if index == 0:
            issues.append(
                _issue(
                    ("slides", index, "transitionIn"), "project.slide.firstHasTransition", **where
                )
            )
        if transition.transition_id not in transition_ids:
            issues.append(
                _issue(
                    ("slides", index, "transitionIn", "transitionId"),
                    "project.slide.unknownTransition",
                    **where,
                    transitionId=transition.transition_id,
                )
            )
    return issues


def _check_slide_trim(
    index: int, slide: VideoSlide, duration: float, where: Params
) -> ApiErrorIssue | None:
    """`0 <= trimIn < trimOut <= duration` (spec slideshow-project)."""
    if slide.trim_out > duration + _TRIM_EPSILON:
        return _issue(
            ("slides", index, "trimOut"),
            "project.slide.trimOutBeyondFile",
            **where,
            trimOut=slide.trim_out,
            duration=duration,
        )
    if slide.trim_in >= slide.trim_out:
        return _issue(
            ("slides", index, "trimIn"),
            "project.slide.trimInNotBeforeTrimOut",
            **where,
            trimIn=slide.trim_in,
            trimOut=slide.trim_out,
        )
    return None


def _check_music(
    project: Project, items: dict[str, ImageItem | AudioItem | VideoItem]
) -> list[ApiErrorIssue]:
    issues: list[ApiErrorIssue] = []
    seen: dict[str, int] = {}
    for index, clip in enumerate(project.music):
        where: Params = {"clip": index + 1, "clipId": clip.id}
        if clip.id in seen:
            issues.append(
                _issue(
                    ("music", index, "id"),
                    "project.music.duplicateId",
                    **where,
                    firstClip=seen[clip.id] + 1,
                )
            )
        else:
            seen[clip.id] = index
        item = items.get(clip.media_id)
        if item is None:
            issues.append(
                _issue(
                    ("music", index, "mediaId"),
                    "project.music.unknownMedia",
                    **where,
                    mediaId=clip.media_id,
                )
            )
            continue
        if not isinstance(item, AudioItem):
            issues.append(
                _issue(
                    ("music", index, "mediaId"),
                    "project.music.notAudio",
                    **where,
                    mediaId=clip.media_id,
                )
            )
            continue
        issue = _check_trim(index, clip, item.duration, where)
        if issue is not None:
            issues.append(issue)
    return issues


def _check_trim(
    index: int, clip: MusicClip, duration: float, where: Params
) -> ApiErrorIssue | None:
    """`0 <= trimStart < end <= duration` and played length >= 0.5 s (spec music-track)."""
    if clip.trim_end is not None and clip.trim_end > duration + _TRIM_EPSILON:
        return _issue(
            ("music", index, "trimEnd"),
            "project.music.trimEndBeyondFile",
            **where,
            trimEnd=clip.trim_end,
            duration=duration,
        )
    end = duration if clip.trim_end is None else min(clip.trim_end, duration)
    if clip.trim_start >= end:
        return _issue(
            ("music", index, "trimStart"),
            "project.music.trimStartNotBeforeEnd",
            **where,
            trimStart=clip.trim_start,
            end=end,
        )
    length = end - clip.trim_start
    if length < MUSIC_CLIP_MIN_LENGTH - _TRIM_EPSILON:
        return _issue(
            ("music", index),
            "project.music.tooShort",
            **where,
            min=MUSIC_CLIP_MIN_LENGTH,
            length=length,
        )
    return None


def remove_media_slides(project: Project, media_id: str) -> Project:
    """Removes all elements with `media_id` together with their incoming transitions,
    and all music clips with `media_id` (the following clips move up).

    Afterwards the (new) first element no longer has a transition.
    """
    slides = [s for s in project.slides if s.media_id != media_id]
    if slides and slides[0].transition_in is not None:
        slides[0] = slides[0].model_copy(update={"transition_in": None})
    music = [c for c in project.music if c.media_id != media_id]
    return project.model_copy(update={"slides": slides, "music": music})


# --- Store -------------------------------------------------------------------


class ProjectStore:
    """The one project in the data directory; one instance per app (app.state.project)."""

    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.project_file = data_dir / "project.json"
        self._lock = asyncio.Lock()
        self._corrupt = False
        self._project = self._read()

    def _read(self) -> Project:
        try:
            raw = self.project_file.read_bytes()
        except FileNotFoundError:
            return empty_project()
        try:
            return Project.model_validate(migrate_project_data(json.loads(raw)))
        except (ValueError, ValidationError) as exc:
            logger.warning(
                "Project file %s is corrupt, starting with an empty project "
                "(the file is kept until the next save): %s",
                self.project_file,
                exc,
            )
            self._corrupt = True
            return empty_project()

    def get(self) -> Project:
        return self._project

    def _write(self, project: Project) -> None:
        if self._corrupt and self.project_file.exists():
            stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
            backup = self.project_file.with_name(f"{self.project_file.name}.corrupt-{stamp}")
            self.project_file.replace(backup)
            logger.warning("Corrupt project file backed up as %s", backup)
        write_bytes_atomic(self.project_file, project.model_dump_json(indent=2).encode())
        self._corrupt = False

    async def save(
        self,
        project: Project,
        *,
        media: Iterable[ImageItem | AudioItem | VideoItem],
        transition_ids: Collection[str],
    ) -> Project:
        """Checks the references and writes atomically; on errors everything stays unchanged."""
        async with self._lock:
            issues = check_references(project, media, transition_ids)
            if issues:
                raise ProjectValidationError(issues)
            await asyncio.to_thread(self._write, project)
            self._project = project
            return project

    async def remove_media(self, media_id: str) -> Project:
        """Cascade when a medium is deleted (design.md D7); writes only on change."""
        async with self._lock:
            updated = remove_media_slides(self._project, media_id)
            if updated != self._project:
                await asyncio.to_thread(self._write, updated)
                self._project = updated
            return self._project
