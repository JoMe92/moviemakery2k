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
- Per-file upload results: ``error`` (code), ``errorParams`` and ``message``.
- Export jobs: ``errorCode``, ``errorParams`` and ``error`` (message).

``ERRORS`` below is the complete list; every code documents its params.
Codes are part of the API contract: never rename one, add a new one instead.
"""

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from pydantic_core import PydanticCustomError

ParamValue = str | int | float
Params = dict[str, ParamValue]


@dataclass(frozen=True, slots=True)
class ErrorSpec:
    template: str
    """English message; ``{name}`` placeholders are filled from the params."""
    params: tuple[str, ...] = ()
    """Names of the params the code always carries."""


ERRORS: dict[str, ErrorSpec] = {
    # --- Media ------------------------------------------------------------------
    # 404 for an unknown or malformed media id (thumbnail, preview, delete).
    "media.notFound": ErrorSpec("Media item not found.", ("mediaId",)),
    # 413: more files in one upload request than allowed.
    "media.tooManyFiles": ErrorSpec(
        "Too many files: at most {max} per import ({count} sent).", ("max", "count")
    ),
    # Per-file upload results.
    "media.unsupportedType": ErrorSpec("Not a supported image (JPEG, PNG and WebP are allowed)."),
    "media.tooLarge": ErrorSpec(
        "The file is too large (at most {maxMegabytes} MB).", ("maxMegabytes",)
    ),
    "media.tooManyPixels": ErrorSpec(
        "The image has too many pixels (at most {maxMegapixels} megapixels).",
        ("maxMegapixels",),
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
    # --- Export: requests ---------------------------------------------------------
    "export.notFound": ErrorSpec("Export not found.", ("exportId",)),
    "export.emptyProject": ErrorSpec("Cannot export: the storyboard is empty."),
    # `slides`: comma-separated 1-based positions; `mediaIds`: comma-separated ids.
    "export.missingMedia": ErrorSpec(
        "Cannot export: media missing for slide(s) {slides}.", ("count", "slides", "mediaIds")
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
    "export.saveFailed": ErrorSpec("The export could not be saved: {reason}", ("reason",)),
    "export.unexpected": ErrorSpec("The export failed unexpectedly."),
}


def _format_value(value: ParamValue) -> str:
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def error_message(code: str, params: Params | None = None) -> str:
    """The English message for `code`, filled with `params`."""
    values = {name: _format_value(value) for name, value in (params or {}).items()}
    return ERRORS[code].template.format_map(values)


class _ErrorModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ApiError(_ErrorModel):
    """An error of the backend: stable code, params and English message (design.md D5)."""

    code: str = Field(description="Stable dotted error code, e.g. `export.emptyProject`")
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


def api_error(code: str, **params: ParamValue) -> ApiError:
    return ApiError(code=code, params=params, message=error_message(code, params))


def api_exception(status_code: int, code: str, **params: ParamValue) -> HTTPException:
    """`HTTPException` whose `detail` is an `ApiError`; raise it from a route."""
    return HTTPException(status_code=status_code, detail=api_error(code, **params).model_dump())


def validation_error(code: str, **params: ParamValue) -> PydanticCustomError:
    """Error for a Pydantic validator: FastAPI reports it with `type` = code,
    `msg` = English message and `ctx` = params."""
    return PydanticCustomError(code, error_message(code, params), dict(params))


def error_response(description: str) -> dict[str, Any]:
    """OpenAPI entry for `responses=` documenting an `ApiError` body."""
    return {"model": ApiErrorResponse, "description": description}
