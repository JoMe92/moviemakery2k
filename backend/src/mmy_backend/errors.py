"""Stable error codes with English messages (design.md D5).

The backend's own errors (media, project, export) carry a dotted, stable
``code``, the ``params`` the message is built from, and an English ``message``.
The web app translates known codes and falls back to ``message`` otherwise.

Where an error shows up:

- HTTP errors raised by the API: ``{"detail": {"code", "params", "message"}}``
  (``ApiError``); project reference errors add ``issues`` (``ApiErrorWithIssues``).
- Rule violations found while FastAPI parses a request body (durations, file
  name): FastAPI's native 422 list, where ``type`` is the code, ``ctx`` the
  params and ``msg`` the English message (see ``validation_error``).
- Per-file upload results and export jobs: ``errorCode``, ``errorParams`` and
  ``message`` (design.md D3).

``ErrorCode`` lists every code; it appears in OpenAPI as an enum (``ApiError.code``,
``errorCode``), so the generated TS types carry the union of all codes (design.md
D4). ``ERRORS`` holds the English template and the params of every code.
Codes are part of the API contract: never rename one, add a new one instead.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from pydantic_core import PydanticCustomError

ParamValue = str | int | float
Params = dict[str, ParamValue]


class ErrorCode(StrEnum):
    """All stable error codes; part of the API contract as an OpenAPI enum (design.md D4).

    Never rename a code, add a new one instead.
    """

    AUTH_REQUIRED = "auth.required"
    MEDIA_NOT_FOUND = "media.notFound"
    MEDIA_TOO_MANY_FILES = "media.tooManyFiles"
    MEDIA_UNSUPPORTED_TYPE = "media.unsupportedType"
    MEDIA_TOO_LARGE = "media.tooLarge"
    MEDIA_TOO_MANY_PIXELS = "media.tooManyPixels"
    MEDIA_IN_USE_BY_EXPORT = "media.inUseByExport"
    MEDIA_AUDIO_TOO_LONG = "media.audioTooLong"
    MEDIA_NO_AUDIO_STREAM = "media.noAudioStream"
    MEDIA_VIDEO_TOO_LONG = "media.videoTooLong"
    MEDIA_NO_VIDEO_STREAM = "media.noVideoStream"
    MEDIA_PROBE_UNAVAILABLE = "media.probeUnavailable"
    PROJECT_SLIDE_DURATION_OUT_OF_RANGE = "project.slideDuration.outOfRange"
    PROJECT_SLIDE_DURATION_OFF_GRID = "project.slideDuration.offGrid"
    PROJECT_TRANSITION_DURATION_OUT_OF_RANGE = "project.transitionDuration.outOfRange"
    PROJECT_TRANSITION_DURATION_OFF_GRID = "project.transitionDuration.offGrid"
    PROJECT_MUSIC_VOLUME_OUT_OF_RANGE = "project.musicVolume.outOfRange"
    PROJECT_MUSIC_TRIM_NEGATIVE = "project.musicTrim.negative"
    PROJECT_NARRATION_VOLUME_OUT_OF_RANGE = "project.narrationVolume.outOfRange"
    PROJECT_NARRATION_TRIM_NEGATIVE = "project.narrationTrim.negative"
    PROJECT_NARRATION_AT_OUT_OF_RANGE = "project.narrationAt.outOfRange"
    PROJECT_CLIP_AUDIO_BALANCE_OUT_OF_RANGE = "project.clipAudioBalance.outOfRange"
    PROJECT_SLIDE_TRIM_NEGATIVE = "project.slideTrim.negative"
    PROJECT_TITLE_TEXT_MISSING = "project.titleText.missing"
    PROJECT_TITLE_TEXT_AMBIGUOUS = "project.titleText.ambiguous"
    PROJECT_INVALID = "project.invalid"
    PROJECT_SLIDE_DUPLICATE_ID = "project.slide.duplicateId"
    PROJECT_SLIDE_UNKNOWN_MEDIA = "project.slide.unknownMedia"
    PROJECT_SLIDE_FIRST_HAS_TRANSITION = "project.slide.firstHasTransition"
    PROJECT_SLIDE_UNKNOWN_TRANSITION = "project.slide.unknownTransition"
    PROJECT_SLIDE_UNKNOWN_EFFECT = "project.slide.unknownEffect"
    PROJECT_SLIDE_UNKNOWN_TITLE_STYLE = "project.slide.unknownTitleStyle"
    PROJECT_SLIDE_NOT_IMAGE = "project.slide.notImage"
    PROJECT_SLIDE_NOT_VIDEO = "project.slide.notVideo"
    PROJECT_SLIDE_TRIM_OUT_BEYOND_FILE = "project.slide.trimOutBeyondFile"
    PROJECT_SLIDE_TRIM_IN_NOT_BEFORE_TRIM_OUT = "project.slide.trimInNotBeforeTrimOut"
    PROJECT_MUSIC_DUPLICATE_ID = "project.music.duplicateId"
    PROJECT_MUSIC_UNKNOWN_MEDIA = "project.music.unknownMedia"
    PROJECT_MUSIC_NOT_AUDIO = "project.music.notAudio"
    PROJECT_MUSIC_TRIM_END_BEYOND_FILE = "project.music.trimEndBeyondFile"
    PROJECT_MUSIC_TRIM_START_NOT_BEFORE_END = "project.music.trimStartNotBeforeEnd"
    PROJECT_MUSIC_TOO_SHORT = "project.music.tooShort"
    PROJECT_NARRATION_DUPLICATE_ID = "project.narration.duplicateId"
    PROJECT_NARRATION_UNKNOWN_MEDIA = "project.narration.unknownMedia"
    PROJECT_NARRATION_NOT_AUDIO = "project.narration.notAudio"
    PROJECT_NARRATION_TRIM_END_BEYOND_FILE = "project.narration.trimEndBeyondFile"
    PROJECT_NARRATION_TRIM_START_NOT_BEFORE_END = "project.narration.trimStartNotBeforeEnd"
    PROJECT_NARRATION_TOO_SHORT = "project.narration.tooShort"
    EXPORT_NOT_FOUND = "export.notFound"
    EXPORT_EMPTY_PROJECT = "export.emptyProject"
    EXPORT_MISSING_MEDIA = "export.missingMedia"
    EXPORT_MISSING_MUSIC_MEDIA = "export.missingMusicMedia"
    EXPORT_MISSING_NARRATION_MEDIA = "export.missingNarrationMedia"
    EXPORT_BUSY = "export.busy"
    EXPORT_NOT_READY = "export.notReady"
    EXPORT_FILE_NAME_EMPTY = "export.fileName.empty"
    EXPORT_FILE_NAME_INVALID_CHARS = "export.fileName.invalidChars"
    EXPORT_FILE_NAME_CONTROL_CHARS = "export.fileName.controlChars"
    EXPORT_FILE_NAME_INVALID = "export.fileName.invalid"
    EXPORT_FILE_NAME_TOO_LONG = "export.fileName.tooLong"
    EXPORT_GL_UNAVAILABLE = "export.glUnavailable"
    EXPORT_NO_IMAGES = "export.noImages"
    EXPORT_FFMPEG_MISSING = "export.ffmpegMissing"
    EXPORT_FFMPEG_START_FAILED = "export.ffmpegStartFailed"
    EXPORT_FFMPEG_INPUT_CLOSED = "export.ffmpegInputClosed"
    EXPORT_FFMPEG_INPUT_CLOSED_EARLY = "export.ffmpegInputClosedEarly"
    EXPORT_FFMPEG_FAILED = "export.ffmpegFailed"
    EXPORT_RENDER_FAILED = "export.renderFailed"
    EXPORT_AUDIO_FAILED = "export.audioFailed"
    EXPORT_SAVE_FAILED = "export.saveFailed"
    EXPORT_UNEXPECTED = "export.unexpected"


@dataclass(frozen=True, slots=True)
class ErrorSpec:
    template: str
    """English message; ``{name}`` placeholders are filled from the params."""
    params: tuple[str, ...] = ()
    """Names of the params the code always carries."""


_SPECS: dict[str, ErrorSpec] = {
    # --- Access -----------------------------------------------------------------
    # 401 in the LAN mode without a valid access token (mmy_backend.access).
    "auth.required": ErrorSpec(
        "Access required: open the link or QR code from the terminal again."
    ),
    # --- Media ------------------------------------------------------------------
    # 404 for an unknown or malformed media id (thumbnail, preview, delete).
    "media.notFound": ErrorSpec("Media item not found.", ("mediaId",)),
    # 413: more files in one upload request than allowed.
    "media.tooManyFiles": ErrorSpec(
        "Too many files: at most {max} per import ({count} sent).", ("max", "count")
    ),
    # Per-file upload results.
    "media.unsupportedType": ErrorSpec(
        "Not a supported image, video or audio file (allowed are JPEG, PNG, WebP, "
        "MP4/MOV and MKV/WebM (H.264, HEVC, VP9 or AV1), "
        "MP3, WAV, M4A/AAC, OGG and FLAC)."
    ),
    # `maxMegabytes` depends on the kind: 25 for images, 100 for audio, 500 for video.
    "media.tooLarge": ErrorSpec(
        "The file is too large (at most {maxMegabytes} MB).", ("maxMegabytes",)
    ),
    "media.tooManyPixels": ErrorSpec(
        "The image has too many pixels (at most {maxMegapixels} megapixels).",
        ("maxMegapixels",),
    ),
    "media.audioTooLong": ErrorSpec(
        "The audio file is too long (at most {maxMinutes} minutes).", ("maxMinutes",)
    ),
    "media.noAudioStream": ErrorSpec("The file contains no audio track."),
    "media.videoTooLong": ErrorSpec(
        "The video file is too long (at most {maxMinutes} minutes).", ("maxMinutes",)
    ),
    "media.noVideoStream": ErrorSpec(
        "The file contains no decodable video track in a supported codec."
    ),
    "media.probeUnavailable": ErrorSpec(
        "Audio files cannot be checked: ffprobe was not found or could not be started."
    ),
    # 409 on delete while a queued or running export uses the medium (design.md D5).
    "media.inUseByExport": ErrorSpec(
        "The medium cannot be deleted while it is being exported. "
        "Wait for the export to finish or cancel it first.",
        ("mediaId", "exportId"),
    ),
    # --- Project: rule violations while parsing PUT /api/project (native 422 list) --
    "project.slideDuration.outOfRange": ErrorSpec(
        "The slide duration must be between {min} and {max} s (is {value} s).",
        ("min", "max", "value"),
    ),
    "project.slideDuration.offGrid": ErrorSpec(
        "The slide duration must be a multiple of {step} s (is {value} s).", ("step", "value")
    ),
    "project.transitionDuration.outOfRange": ErrorSpec(
        "The transition duration must be between {min} and {max} s (is {value} s).",
        ("min", "max", "value"),
    ),
    "project.transitionDuration.offGrid": ErrorSpec(
        "The transition duration must be a multiple of {step} s (is {value} s).",
        ("step", "value"),
    ),
    "project.musicVolume.outOfRange": ErrorSpec(
        "The music volume must be between {min} and {max} (is {value}).",
        ("min", "max", "value"),
    ),
    "project.musicTrim.negative": ErrorSpec(
        "The start and end of a music clip must be 0 s or later (is {value} s).", ("value",)
    ),
    "project.slideTrim.negative": ErrorSpec(
        "The start and end of a video clip must be 0 s or later (is {value} s).", ("value",)
    ),
    # Narration (spec narration-track): same limits as music, plus the stored
    # absolute start time and the one global level.
    "project.narrationVolume.outOfRange": ErrorSpec(
        "The narration volume must be between {min} and {max} (is {value}).",
        ("min", "max", "value"),
    ),
    "project.narrationTrim.negative": ErrorSpec(
        "The start and end of a narration clip must be 0 s or later (is {value} s).", ("value",)
    ),
    "project.narrationAt.outOfRange": ErrorSpec(
        "The start time of a narration clip must be between {min} and {max} s (is {value} s).",
        ("min", "max", "value"),
    ),
    "project.clipAudioBalance.outOfRange": ErrorSpec(
        "The audio level must be between {min} and {max} (is {value}).",
        ("min", "max", "value"),
    ),
    # Title element: exactly one of `lines`/`creditEntries` is set.
    "project.titleText.missing": ErrorSpec(
        "Title “{slideId}”: either lines or credit entries must be set.", ("slideId",)
    ),
    "project.titleText.ambiguous": ErrorSpec(
        "Title “{slideId}”: lines and credit entries must not both be set.", ("slideId",)
    ),
    # --- Project: reference checks of PUT /api/project (422, ApiErrorWithIssues) --
    "project.invalid": ErrorSpec("The project is invalid: {summary}", ("count", "summary")),
    # Issues: `slide` is the 1-based position, `slideId` the slide's id.
    "project.slide.duplicateId": ErrorSpec(
        "Slide {slide} (ID “{slideId}”): the ID is already used by slide {firstSlide}.",
        ("slide", "slideId", "firstSlide"),
    ),
    "project.slide.unknownMedia": ErrorSpec(
        "Slide {slide} (ID “{slideId}”): unknown media item “{mediaId}”.",
        ("slide", "slideId", "mediaId"),
    ),
    "project.slide.firstHasTransition": ErrorSpec(
        "Slide {slide} (ID “{slideId}”): the first slide cannot have an incoming transition.",
        ("slide", "slideId"),
    ),
    "project.slide.unknownTransition": ErrorSpec(
        "Slide {slide} (ID “{slideId}”): unknown transition “{transitionId}”.",
        ("slide", "slideId", "transitionId"),
    ),
    "project.slide.unknownEffect": ErrorSpec(
        "Slide {slide} (ID “{slideId}”): unknown effect “{effectId}”.",
        ("slide", "slideId", "effectId"),
    ),
    # Title element or overlay title referring to an ID outside the title catalog.
    "project.slide.unknownTitleStyle": ErrorSpec(
        "Slide {slide} (ID “{slideId}”): unknown title style “{styleId}”.",
        ("slide", "slideId", "styleId"),
    ),
    "project.slide.notImage": ErrorSpec(
        "Slide {slide} (ID “{slideId}”): media item “{mediaId}” is not an image.",
        ("slide", "slideId", "mediaId"),
    ),
    "project.slide.notVideo": ErrorSpec(
        "Slide {slide} (ID “{slideId}”): media item “{mediaId}” is not a video.",
        ("slide", "slideId", "mediaId"),
    ),
    "project.slide.trimOutBeyondFile": ErrorSpec(
        "Slide {slide} (ID “{slideId}”): the end ({trimOut} s) lies beyond the end "
        "of the video ({duration} s).",
        ("slide", "slideId", "trimOut", "duration"),
    ),
    "project.slide.trimInNotBeforeTrimOut": ErrorSpec(
        "Slide {slide} (ID “{slideId}”): the start ({trimIn} s) must lie before "
        "the end ({trimOut} s).",
        ("slide", "slideId", "trimIn", "trimOut"),
    ),
    # Music issues: `clip` is the 1-based position, `clipId` the clip's id.
    "project.music.duplicateId": ErrorSpec(
        "Music clip {clip} (ID “{clipId}”): the ID is already used by music clip {firstClip}.",
        ("clip", "clipId", "firstClip"),
    ),
    "project.music.unknownMedia": ErrorSpec(
        "Music clip {clip} (ID “{clipId}”): unknown media item “{mediaId}”.",
        ("clip", "clipId", "mediaId"),
    ),
    "project.music.notAudio": ErrorSpec(
        "Music clip {clip} (ID “{clipId}”): media item “{mediaId}” is not an audio file.",
        ("clip", "clipId", "mediaId"),
    ),
    "project.music.trimEndBeyondFile": ErrorSpec(
        "Music clip {clip} (ID “{clipId}”): the end ({trimEnd} s) lies beyond the end "
        "of the file ({duration} s).",
        ("clip", "clipId", "trimEnd", "duration"),
    ),
    # `end`: the effective end (trimEnd, or the file duration if trimEnd is null).
    "project.music.trimStartNotBeforeEnd": ErrorSpec(
        "Music clip {clip} (ID “{clipId}”): the start ({trimStart} s) must lie before "
        "the end ({end} s).",
        ("clip", "clipId", "trimStart", "end"),
    ),
    "project.music.tooShort": ErrorSpec(
        "Music clip {clip} (ID “{clipId}”): the clip must play at least {min} s "
        "(plays {length} s).",
        ("clip", "clipId", "min", "length"),
    ),
    # Narration issues: `clip` is the 1-based position, `clipId` the clip's id.
    "project.narration.duplicateId": ErrorSpec(
        "Narration clip {clip} (ID “{clipId}”): the ID is already used by "
        "narration clip {firstClip}.",
        ("clip", "clipId", "firstClip"),
    ),
    "project.narration.unknownMedia": ErrorSpec(
        "Narration clip {clip} (ID “{clipId}”): unknown media item “{mediaId}”.",
        ("clip", "clipId", "mediaId"),
    ),
    "project.narration.notAudio": ErrorSpec(
        "Narration clip {clip} (ID “{clipId}”): media item “{mediaId}” is not an audio file.",
        ("clip", "clipId", "mediaId"),
    ),
    "project.narration.trimEndBeyondFile": ErrorSpec(
        "Narration clip {clip} (ID “{clipId}”): the end ({trimEnd} s) lies beyond "
        "the end of the file ({duration} s).",
        ("clip", "clipId", "trimEnd", "duration"),
    ),
    # `end`: the effective end (trimEnd, or the file duration if trimEnd is null).
    "project.narration.trimStartNotBeforeEnd": ErrorSpec(
        "Narration clip {clip} (ID “{clipId}”): the start ({trimStart} s) must lie "
        "before the end ({end} s).",
        ("clip", "clipId", "trimStart", "end"),
    ),
    "project.narration.tooShort": ErrorSpec(
        "Narration clip {clip} (ID “{clipId}”): the clip must play at least {min} s "
        "(plays {length} s).",
        ("clip", "clipId", "min", "length"),
    ),
    # --- Export: requests ---------------------------------------------------------
    "export.notFound": ErrorSpec("Export not found.", ("exportId",)),
    "export.emptyProject": ErrorSpec("Cannot export: the storyboard is empty."),
    # `slides`: comma-separated 1-based positions; `mediaIds`: comma-separated ids.
    "export.missingMedia": ErrorSpec(
        "Cannot export: media missing for slide(s) {slides}.", ("count", "slides", "mediaIds")
    ),
    # `clips`: comma-separated 1-based positions in the music track; `mediaIds`: ids.
    "export.missingNarrationMedia": ErrorSpec(
        "Cannot export: media missing for narration clip(s) {clips}.",
        ("count", "clips", "mediaIds"),
    ),
    "export.missingMusicMedia": ErrorSpec(
        "Cannot export: media missing for music clip(s) {clips}.", ("count", "clips", "mediaIds")
    ),
    "export.busy": ErrorSpec(
        "An export is already running. Wait for it to finish or cancel it first.",
        ("exportId",),
    ),
    "export.notReady": ErrorSpec(
        "The movie is not available: the export has the status “{status}”.", ("status",)
    ),
    # File name rules (native 422 list, loc ["body", "fileName"]).
    "export.fileName.empty": ErrorSpec("The file name must not be empty."),
    "export.fileName.invalidChars": ErrorSpec(
        "The file name contains characters that are not allowed: {chars} "
        '(not allowed are / \\ : * ? " < > |).',
        ("chars",),
    ),
    "export.fileName.controlChars": ErrorSpec("The file name contains control characters."),
    "export.fileName.invalid": ErrorSpec("The file name is invalid."),
    "export.fileName.tooLong": ErrorSpec(
        "The file name is too long (at most {max} characters).", ("max",)
    ),
    # --- Export: job failures (ExportJob.errorCode) -------------------------------
    # `reason`: technical detail from the GL driver; not part of the message.
    "export.glUnavailable": ErrorSpec(
        "Export is not available on this system: no OpenGL context could be created for "
        "rendering. Supported is Linux with software rendering (Mesa llvmpipe).",
        ("reason",),
    ),
    "export.noImages": ErrorSpec("Cannot export: the project contains no images."),
    "export.ffmpegMissing": ErrorSpec("Cannot export: FFmpeg was not found."),
    "export.ffmpegStartFailed": ErrorSpec("FFmpeg could not be started: {reason}", ("reason",)),
    "export.ffmpegInputClosed": ErrorSpec(
        "FFmpeg closed its input at frame {frame}/{total}.", ("frame", "total")
    ),
    "export.ffmpegInputClosedEarly": ErrorSpec("FFmpeg closed its input prematurely."),
    "export.ffmpegFailed": ErrorSpec("FFmpeg failed with exit code {returnCode}.", ("returnCode",)),
    # `reason`: technical detail (English), e.g. a shader error.
    "export.renderFailed": ErrorSpec("The export failed: {reason}", ("reason",)),
    "export.audioFailed": ErrorSpec("The music could not be mixed: {reason}", ("reason",)),
    "export.saveFailed": ErrorSpec("The export could not be saved: {reason}", ("reason",)),
    "export.unexpected": ErrorSpec("The export failed unexpectedly."),
}

if set(_SPECS) != set(ErrorCode):  # pragma: no cover - guards against drift at import
    raise RuntimeError(f"ErrorCode and ERRORS differ: {set(_SPECS) ^ set(ErrorCode)}")

ERRORS: dict[ErrorCode, ErrorSpec] = {ErrorCode(code): spec for code, spec in _SPECS.items()}
"""Template and params of every code, keyed by `ErrorCode`."""


def _format_value(value: ParamValue) -> str:
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def error_message(code: ErrorCode | str, params: Params | None = None) -> str:
    """The English message for `code`, filled with `params`."""
    values = {name: _format_value(value) for name, value in (params or {}).items()}
    return ERRORS[ErrorCode(code)].template.format_map(values)


class _ErrorModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ApiError(_ErrorModel):
    """An error of the backend: stable code, params and English message (design.md D5)."""

    code: ErrorCode = Field(description="Stable dotted error code, e.g. `export.emptyProject`")
    params: Params = Field(description="Values the message is built from")
    message: str = Field(description="English message; shown when the code is unknown")


class ApiErrorIssue(ApiError):
    """One rule violation of a request body, with the position of the offending value."""

    loc: list[str | int] = Field(description='Position in the body, e.g. ["body", "slides", 2]')


class ApiErrorWithIssues(ApiError):
    """An error that collects several rule violations (`project.invalid`)."""

    issues: list[ApiErrorIssue]


class ApiErrorResponse(_ErrorModel):
    detail: ApiError


class ApiErrorWithIssuesResponse(_ErrorModel):
    detail: ApiErrorWithIssues


class RequestValidationIssue(BaseModel):
    """One entry of FastAPI's native 422 list. For rule violations of this API,
    `type` is an error code from `ERRORS`, `ctx` its params and `msg` the message."""

    loc: list[str | int]
    msg: str
    type: str
    input: Any = None
    ctx: dict[str, Any] | None = None


class ApiValidationResponse(BaseModel):
    """422 body: an `ApiError` or FastAPI's native list."""

    detail: ApiError | list[RequestValidationIssue]


class ProjectValidationResponse(BaseModel):
    """422 body of PUT /api/project: reference errors or FastAPI's native list."""

    detail: ApiErrorWithIssues | list[RequestValidationIssue]


def api_error(code: ErrorCode | str, **params: ParamValue) -> ApiError:
    return ApiError(code=ErrorCode(code), params=params, message=error_message(code, params))


def api_exception(status_code: int, code: ErrorCode | str, **params: ParamValue) -> HTTPException:
    """`HTTPException` whose `detail` is an `ApiError`; raise it from a route."""
    return HTTPException(
        status_code=status_code, detail=api_error(code, **params).model_dump(mode="json")
    )


def validation_error(code: ErrorCode | str, **params: ParamValue) -> PydanticCustomError:
    """Error for a Pydantic validator: FastAPI reports it with `type` = code,
    `msg` = English message and `ctx` = params."""
    code = ErrorCode(code)
    return PydanticCustomError(code.value, error_message(code, params), dict(params))


def error_response(description: str) -> dict[str, Any]:
    """OpenAPI entry for `responses=` documenting an `ApiError` body."""
    return {"model": ApiErrorResponse, "description": description}
