"""Export jobs (design.md D5, TASK-API-006).

One `ExportManager` per app (app.state.exports) keeps the jobs in memory:

- `start` takes a snapshot (deep copy) of the saved project and starts a
  dedicated worker thread. At most one job is `queued` or `running`; a second
  start raises `ExportBusy` (→ 409).
- The worker calls `export_movie`; GL context, shaders and FFmpeg are created
  in that thread (EGL contexts are bound to a thread). Output is written to
  `<data_dir>/exports/<id>/out.mp4.part` and, on success, atomically moved to `out.mp4`.
- Status sequence: `queued` → `running` → `done` | `failed` | `cancelled`.
  On `failed` and `cancelled` the job directory is removed; no file is left
  behind.
- `cancel` sets the cancel signal and waits until the worker has cleaned up
  (FFmpeg stopped, partial file deleted). The job then stays queryable as
  `cancelled`; `remove` deletes a finished job together with its files.
- `shutdown` (app lifespan) cancels running jobs and waits for the workers.

Retention (TASK-API-007):

- At most the last 5 finished exports (`done`) are kept. When a sixth one
  finishes, the oldest finished export is deleted with its files and its job.
  `queued`/`running` are never removed.
- At most 20 job entries remain in total; beyond that the oldest
  `failed`/`cancelled` ones go first (they have no files).
- Jobs live in memory only; after a restart earlier exports are no longer
  reachable via the API. `cleanup_on_start` (app lifespan) therefore empties
  `<data_dir>/exports/` completely: orphaned partial files (`.part`) as well as
  old, unreachable export directories. Whatever is removed is logged.
"""

import logging
import re
import shutil
import threading
import unicodedata
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from mmy_backend.catalog import TransitionCatalog
from mmy_backend.errors import ErrorCode, Params, error_message, validation_error
from mmy_backend.media import MediaStore
from mmy_backend.project import Project
from mmy_backend.render.context import RenderContextError
from mmy_backend.render.encode import (
    DEFAULT_PROFILE,
    ExportCancelled,
    ExportFailed,
    ExportProfile,
    export_movie,
)
from mmy_backend.render.frames import preview_loader
from mmy_backend.render.timeline import build_timeline, timeline_slides_from_project

logger = logging.getLogger(__name__)

EXPORTS_DIRNAME = "exports"
OUTPUT_FILENAME = "out.mp4"
FILE_EXTENSION = ".mp4"
MAX_FILE_NAME_LENGTH = 120
FORBIDDEN_FILE_NAME_CHARS = '/\\:*?"<>|'
EXPORT_ID_PATTERN = r"^[0-9a-f]{32}$"
_EXPORT_ID_RE = re.compile(EXPORT_ID_PATTERN)

MAX_DONE_EXPORTS = 5
"""At most this many finished exports (with a file) are kept."""
MAX_JOB_ENTRIES = 20
"""At most this many job entries (any status) are kept."""

CANCEL_TIMEOUT_SECONDS = 30.0
"""The longest `cancel` waits for the worker to clean up."""

MESSAGE_GL_UNAVAILABLE = error_message(ErrorCode.EXPORT_GL_UNAVAILABLE)
MESSAGE_UNEXPECTED = error_message(ErrorCode.EXPORT_UNEXPECTED)


class ExportStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"

    @property
    def active(self) -> bool:
        return self in (ExportStatus.QUEUED, ExportStatus.RUNNING)


def normalize_file_name(value: str) -> str:
    """Validates the requested file name (without extension) and normalises it.

    Surrounding whitespace and a trailing `.mp4` extension are removed. Rejected
    are empty names, the characters `/ \\ : * ? " < > |`, control characters and
    names longer than 120 characters.
    """
    name = value.strip()
    if name.lower().endswith(FILE_EXTENSION):
        name = name[: -len(FILE_EXTENSION)].rstrip()
    if not name:
        raise validation_error("export.fileName.empty")
    forbidden = sorted({ch for ch in name if ch in FORBIDDEN_FILE_NAME_CHARS})
    if forbidden:
        raise validation_error("export.fileName.invalidChars", chars=" ".join(forbidden))
    if any(unicodedata.category(ch) in ("Cc", "Cf") for ch in name):
        raise validation_error("export.fileName.controlChars")
    if name in (".", ".."):
        raise validation_error("export.fileName.invalid")
    if len(name) > MAX_FILE_NAME_LENGTH:
        raise validation_error("export.fileName.tooLong", max=MAX_FILE_NAME_LENGTH)
    return name


FileName = Annotated[
    str,
    AfterValidator(normalize_file_name),
    Field(
        description=(
            "Requested file name without extension; `.mp4` is appended on download. "
            'Not allowed: / \\ : * ? " < > | and control characters.'
        ),
        examples=["My Movie"],
    ),
]


class _ExportModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


class ExportRequest(_ExportModel):
    profile: ExportProfile = Field(
        default=DEFAULT_PROFILE,
        description="`high` = 960x720 (default), `small` = 640x480; both 30 fps",
    )
    file_name: FileName


class ExportJob(_ExportModel):
    # The error fields are always sent; mark them required in the schema (design.md D3).
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)

    id: Annotated[str, Field(pattern=EXPORT_ID_PATTERN)]
    status: ExportStatus
    progress: float = Field(ge=0.0, le=1.0, description="Progress 0..1")
    profile: ExportProfile
    file_name: str = Field(description="File name without extension")
    error_code: ErrorCode | None = Field(
        default=None, description="Stable error code when `failed` (design.md D3), otherwise null"
    )
    error_params: Params = Field(
        default_factory=dict, description="Values of the error message; empty without error"
    )
    message: str | None = Field(
        default=None, description="English error message when `failed`, otherwise null"
    )
    created_at: datetime


class ExportListResponse(_ExportModel):
    items: list[ExportJob] = Field(description="All known exports, oldest first")


class ExportBusy(Exception):
    """An export is already running."""

    def __init__(self, job: ExportJob) -> None:
        super().__init__(error_message("export.busy", {"exportId": job.id}))
        self.job = job


def is_export_id(value: str) -> bool:
    return _EXPORT_ID_RE.fullmatch(value) is not None


@dataclass(eq=False, slots=True)
class _Job:
    id: str
    profile: ExportProfile
    file_name: str
    created_at: datetime
    directory: Path
    project: Project
    status: ExportStatus = ExportStatus.QUEUED
    progress: float = 0.0
    error_code: ErrorCode | None = None
    error_params: Params = field(default_factory=dict)
    message: str | None = None
    cancel: threading.Event = field(default_factory=threading.Event)
    thread: threading.Thread | None = None

    @property
    def output(self) -> Path:
        return self.directory / OUTPUT_FILENAME

    def model(self) -> ExportJob:
        return ExportJob(
            id=self.id,
            status=self.status,
            progress=self.progress,
            profile=self.profile,
            file_name=self.file_name,
            error_code=self.error_code,
            error_params=dict(self.error_params),
            message=self.message,
            created_at=self.created_at,
        )


class ExportManager:
    """Export jobs in memory; one instance per app (app.state.exports)."""

    def __init__(
        self,
        data_dir: Path,
        media: MediaStore,
        catalog: TransitionCatalog,
        shaders_dir: Path,
    ) -> None:
        self.exports_dir = data_dir / EXPORTS_DIRNAME
        self._media = media
        self._catalog = catalog
        self._shaders_dir = shaders_dir
        self._lock = threading.Lock()
        self._jobs: dict[str, _Job] = {}

    # --- Cleanup ---------------------------------------------------------------

    def cleanup_on_start(self) -> list[Path]:
        """Empties `exports/` at startup (jobs do not survive a restart).

        Removes orphaned `.part` files and old export directories; returns the
        removed entries. Call only before the first job.
        """
        removed: list[Path] = []
        if not self.exports_dir.is_dir():
            return removed
        for entry in sorted(self.exports_dir.iterdir()):
            parts = [p.name for p in entry.rglob("*.part")] if entry.is_dir() else []
            if entry.is_dir() and not entry.is_symlink():
                shutil.rmtree(entry, ignore_errors=True)
            else:
                entry.unlink(missing_ok=True)
            removed.append(entry)
            if parts or entry.name.endswith(".part"):
                logger.warning("Removed orphaned partial file: %s", entry)
            else:
                logger.info("Removed old export from a previous run: %s", entry)
        return removed

    def _prune(self) -> None:
        """Enforces retention: ≤ 5 finished exports, ≤ 20 job entries."""
        victims: list[_Job] = []
        with self._lock:
            done = [j for j in self._jobs.values() if j.status is ExportStatus.DONE]
            for job in done[: max(0, len(done) - MAX_DONE_EXPORTS)]:
                victims.append(self._jobs.pop(job.id))
            excess = len(self._jobs) - MAX_JOB_ENTRIES
            if excess > 0:
                terminal = [
                    j
                    for j in self._jobs.values()
                    if j.status in (ExportStatus.FAILED, ExportStatus.CANCELLED)
                ]
                done = [j for j in self._jobs.values() if j.status is ExportStatus.DONE]
                for job in (terminal + done)[:excess]:
                    victims.append(self._jobs.pop(job.id))
        for job in victims:
            self._discard(job)
            logger.info("Export %s removed (retention)", job.id)

    # --- Queries ----------------------------------------------------------------

    def list(self) -> list[ExportJob]:
        with self._lock:
            return [job.model() for job in self._jobs.values()]

    def get(self, export_id: str) -> ExportJob | None:
        with self._lock:
            job = self._jobs.get(export_id)
            return job.model() if job is not None else None

    def export_using_media(self, media_id: str) -> str | None:
        """ID of a `queued`/`running` job whose snapshot uses `media_id`, else None."""
        with self._lock:
            for job in self._jobs.values():
                if not job.status.active:
                    continue
                if any(s.media_id == media_id for s in job.project.slides):
                    return job.id
            return None

    def file_path(self, export_id: str) -> Path | None:
        """Path of the finished file; only with status `done`, otherwise None."""
        with self._lock:
            job = self._jobs.get(export_id)
            if job is None or job.status is not ExportStatus.DONE:
                return None
            return job.output

    # --- Start ------------------------------------------------------------------

    def start(self, project: Project, profile: ExportProfile, file_name: str) -> ExportJob:
        """Creates a job with a snapshot of `project` and starts the worker.

        Raises ExportBusy if a job is `queued` or `running`. Validating the
        project (empty, missing media) is the caller's job.
        """
        snapshot = project.model_copy(deep=True)
        with self._lock:
            active = next((j for j in self._jobs.values() if j.status.active), None)
            if active is not None:
                raise ExportBusy(active.model())
            export_id = uuid.uuid4().hex
            job = _Job(
                id=export_id,
                profile=profile,
                file_name=file_name,
                created_at=datetime.now(UTC),
                directory=self.exports_dir / export_id,
                project=snapshot,
            )
            self._jobs[export_id] = job
            created = job.model()
            job.thread = threading.Thread(
                target=self._run, args=(job,), name=f"export-{export_id[:8]}", daemon=True
            )
            job.thread.start()
        logger.info("Export %s started (%s, %d images)", export_id, profile, len(snapshot.slides))
        return created

    # --- Worker -----------------------------------------------------------------

    def _set(self, job: _Job, **changes: object) -> None:
        with self._lock:
            for name, value in changes.items():
                setattr(job, name, value)

    def _on_progress(self, job: _Job, fraction: float) -> None:
        with self._lock:
            if job.status is ExportStatus.RUNNING:
                job.progress = max(job.progress, min(fraction, 1.0))

    def _fail(self, job: _Job, code: ErrorCode, params: Params) -> None:
        self._set(
            job,
            status=ExportStatus.FAILED,
            error_code=code,
            error_params=params,
            message=error_message(code, params),
        )

    def _run(self, job: _Job) -> None:
        try:
            self._export(job)
        finally:
            self._prune()

    def _export(self, job: _Job) -> None:
        with self._lock:
            if job.cancel.is_set():
                job.status = ExportStatus.CANCELLED
                return
            job.status = ExportStatus.RUNNING
        try:
            timeline = build_timeline(timeline_slides_from_project(job.project))
            export_movie(
                timeline,
                self._catalog,
                job.profile,
                job.output,
                preview_loader(self._media),
                progress=lambda fraction: self._on_progress(job, fraction),
                cancel=job.cancel,
                shaders_dir=self._shaders_dir,
            )
        except ExportCancelled:
            self._discard(job)
            self._set(job, status=ExportStatus.CANCELLED)
            logger.info("Export %s cancelled", job.id)
        except ExportFailed as exc:
            self._discard(job)
            code: ErrorCode
            params: Params
            if isinstance(exc.__cause__, RenderContextError):
                code, params = ErrorCode.EXPORT_GL_UNAVAILABLE, {"reason": str(exc.__cause__)}
            else:
                code, params = ErrorCode(exc.code), exc.params
            logger.error("Export %s failed: %s %s", job.id, exc, params)
            self._fail(job, code, params)
        except Exception:
            self._discard(job)
            logger.exception("Export %s failed unexpectedly", job.id)
            self._fail(job, ErrorCode.EXPORT_UNEXPECTED, {})
        else:
            self._set(job, status=ExportStatus.DONE, progress=1.0)
            logger.info("Export %s done: %s", job.id, job.output)

    @staticmethod
    def _discard(job: _Job) -> None:
        shutil.rmtree(job.directory, ignore_errors=True)

    # --- Cancel and delete -------------------------------------------------------

    def cancel(self, export_id: str, timeout: float = CANCEL_TIMEOUT_SECONDS) -> ExportJob | None:
        """Cancels a job or deletes a finished one; None if unknown.

        - `queued`/`running`: set the cancel signal and wait for the worker
          (blocking, at most `timeout`). Afterwards the job is `cancelled`,
          without a partial file, and stays queryable. If it finished at the
          same moment, the result is discarded: the user wanted to cancel.
        - `done`/`failed`/`cancelled`: files and job are deleted.

        Returns the state of the job after the action.
        """
        with self._lock:
            job = self._jobs.get(export_id)
            if job is None:
                return None
            if not job.status.active:
                del self._jobs[export_id]
                removed = job.model()
            else:
                job.cancel.set()
                removed = None
        if removed is not None:
            self._discard(job)
            logger.info("Export %s deleted", export_id)
            return removed
        if job.thread is not None:
            job.thread.join(timeout)
        with self._lock:
            if job.status is ExportStatus.DONE:
                job.status = ExportStatus.CANCELLED
                discard = True
            else:
                discard = False
            result = job.model()
        if discard:
            self._discard(job)
        return result

    def shutdown(self, timeout: float = CANCEL_TIMEOUT_SECONDS) -> None:
        """Cancels running jobs and waits for their workers (app lifespan)."""
        with self._lock:
            threads = []
            for job in self._jobs.values():
                if job.status.active:
                    job.cancel.set()
                if job.thread is not None:
                    threads.append(job.thread)
        for thread in threads:
            thread.join(timeout)
