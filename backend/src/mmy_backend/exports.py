"""Export jobs (design.md D5, TASK-API-006).

One `ExportManager` per app (app.state.exports) keeps the jobs in memory:

- `start` takes a snapshot (deep copy) of the saved project and starts a
  dedicated worker thread. At most one job is `queued` or `running`; a second
  start raises `ExportBusy` (→ 409).
- With music, the worker first mixes it from the originals into
  `<data_dir>/exports/<id>/music.wav` (add-music-track D6, `render.mixdown`),
  checking for cancellation while mixing; a mixing error fails the job with
  `export.audioFailed`. Without music the export keeps its silent track.
  `music.wav` is removed once the export has finished.
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

Job index (design.md D9, TASK-API-011):

- Finished exports are listed in `<data_dir>/exports/index.json` (`id`,
  `fileName`, `profile`, `createdAt`), written atomically whenever the set of
  finished exports changes (index first, then files). Active, failed and
  cancelled jobs live in memory only.
- A job switches to `done` and retention is applied under the same lock in a
  single step: the list never shows more than 5 finished exports.
- `load_on_start` (app lifespan) loads the index entries whose `out.mp4`
  exists as `done` jobs and removes everything else under `exports/`
  (partial files, orphaned directories, jobs without a file, temp files). A
  damaged index is logged and treated as empty. Whatever is removed is logged.
"""

import json
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

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, ValidationError
from pydantic.alias_generators import to_camel

from mmy_backend.catalog import EffectCatalog, TransitionCatalog
from mmy_backend.errors import ErrorCode, Params, error_message, validation_error
from mmy_backend.media import AudioItem, MediaStore
from mmy_backend.project import Project
from mmy_backend.render.context import RenderContextError
from mmy_backend.render.encode import (
    DEFAULT_PROFILE,
    AudioInput,
    ExportCancelled,
    ExportFailed,
    ExportProfile,
    export_movie,
    silent_audio_input,
    video_duration,
)
from mmy_backend.render.frames import preview_loader, video_loader
from mmy_backend.render.mixdown import MIX_FILENAME, file_audio_input, mix_music
from mmy_backend.render.music import MusicClipInput, music_schedule
from mmy_backend.render.timeline import Timeline, build_timeline, timeline_slides_from_project
from mmy_backend.storage import write_bytes_atomic

logger = logging.getLogger(__name__)

EXPORTS_DIRNAME = "exports"
INDEX_FILENAME = "index.json"
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
        description=(
            "`high` = 960x720 (default), `small` = 640x480, `email_web` = 320x240; all 30 fps"
        ),
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


def _check_stored_file_name(value: str) -> str:
    """A name from the index must already be a valid, normalised file name."""
    if normalize_file_name(value) != value:
        raise ValueError("file name is not normalised")
    return value


class ExportIndexEntry(_ExportModel):
    """One finished export in `exports/index.json` (design.md D9)."""

    id: Annotated[str, Field(pattern=EXPORT_ID_PATTERN)]
    file_name: Annotated[str, AfterValidator(_check_stored_file_name)]
    profile: ExportProfile
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
    project: Project | None
    """Snapshot to render; None for exports loaded from the index (already done)."""
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
        effects: EffectCatalog | None = None,
    ) -> None:
        self.exports_dir = data_dir / EXPORTS_DIRNAME
        self.index_file = self.exports_dir / INDEX_FILENAME
        self._media = media
        self._catalog = catalog
        self._effects = effects
        """Effect catalog (add-effects-catalog design.md D2); None means an
        element's `effectId` is ignored by the export."""
        self._shaders_dir = shaders_dir
        self._lock = threading.Lock()
        self._jobs: dict[str, _Job] = {}

    # --- Cleanup ---------------------------------------------------------------

    def load_on_start(self) -> list[Path]:
        """Loads finished exports from the index and removes all other remains.

        Index entries whose `out.mp4` exists become `done` jobs (at most the
        newest 5). Everything else under `exports/` is removed: partial files,
        orphaned directories, directories of jobs without a file, temp files.
        A damaged index is logged and treated as empty. Rewrites an existing
        index and returns the removed paths. Call only before the first job.
        """
        had_index = self.index_file.exists()
        loaded: dict[str, _Job] = {}
        for entry in self._read_index():
            directory = self.exports_dir / entry.id
            output = directory / OUTPUT_FILENAME
            if entry.id in loaded:
                continue
            if directory.is_symlink() or output.is_symlink() or not output.is_file():
                logger.warning("Export %s from the index has no file; dropped", entry.id)
                continue
            loaded[entry.id] = _Job(
                id=entry.id,
                profile=entry.profile,
                file_name=entry.file_name,
                created_at=entry.created_at,
                directory=directory,
                project=None,
                status=ExportStatus.DONE,
                progress=1.0,
            )
        jobs = list(loaded.values())
        for job in jobs[: max(0, len(jobs) - MAX_DONE_EXPORTS)]:
            del loaded[job.id]
            logger.info("Export %s removed (retention)", job.id)

        removed: list[Path] = []
        if self.exports_dir.is_dir():
            for path in sorted(self.exports_dir.iterdir()):
                if path == self.index_file and path.is_file() and not path.is_symlink():
                    continue
                kept = loaded.get(path.name)
                if kept is not None:
                    # A loaded export keeps only its finished file.
                    for inner in sorted(path.iterdir()):
                        if inner.name != OUTPUT_FILENAME:
                            self._remove_remain(inner)
                            removed.append(inner)
                    continue
                self._remove_remain(path)
                removed.append(path)
        with self._lock:
            self._jobs = loaded
            if had_index or loaded:
                self._write_index_locked()
        if loaded:
            logger.info("Loaded %d finished export(s) from the index", len(loaded))
        return removed

    @staticmethod
    def _remove_remain(path: Path) -> None:
        partial = path.name.endswith(".part") or (
            path.is_dir() and not path.is_symlink() and any(path.rglob("*.part"))
        )
        if path.is_dir() and not path.is_symlink():
            shutil.rmtree(path, ignore_errors=True)
        else:
            path.unlink(missing_ok=True)
        if partial:
            logger.warning("Removed orphaned partial file: %s", path)
        else:
            logger.info("Removed export remains from a previous run: %s", path)

    def _read_index(self) -> list[ExportIndexEntry]:
        """Entries of `index.json`; [] if missing or damaged, invalid entries skipped."""
        try:
            raw = self.index_file.read_bytes()
        except FileNotFoundError:
            return []
        except OSError as exc:
            logger.error("Export index %s unreadable (%s); treated as empty", self.index_file, exc)
            return []
        try:
            data = json.loads(raw)
        except ValueError as exc:
            logger.error("Export index %s damaged (%s); treated as empty", self.index_file, exc)
            return []
        if not isinstance(data, list):
            logger.error("Export index %s is not a list; treated as empty", self.index_file)
            return []
        entries: list[ExportIndexEntry] = []
        for item in data:
            try:
                entries.append(ExportIndexEntry.model_validate(item))
            except ValidationError as exc:
                logger.warning("Skipping invalid entry in the export index: %s", exc)
        return entries

    def _write_index_locked(self) -> None:
        """Writes the finished exports to `index.json` atomically; hold `_lock`."""
        entries = [
            ExportIndexEntry.model_construct(
                id=job.id,
                file_name=job.file_name,
                profile=job.profile,
                created_at=job.created_at,
            ).model_dump(mode="json", by_alias=True)
            for job in self._jobs.values()
            if job.status is ExportStatus.DONE
        ]
        try:
            write_bytes_atomic(self.index_file, json.dumps(entries, indent=2).encode())
        except OSError:
            logger.exception("Could not write the export index %s", self.index_file)

    def _finish_locked(self, job: _Job) -> list[_Job]:
        """Switches `job` to `done` and applies retention in one step; hold `_lock`.

        The oldest finished exports beyond 5 are removed from the jobs, the
        index is written, then their files are deleted. Returns the victims.
        """
        done = [j for j in self._jobs.values() if j.status is ExportStatus.DONE and j is not job]
        victims = done[: max(0, len(done) + 1 - MAX_DONE_EXPORTS)]
        for victim in victims:
            del self._jobs[victim.id]
        job.status = ExportStatus.DONE
        job.progress = 1.0
        self._write_index_locked()
        for victim in victims:
            self._discard(victim)
        return victims

    def _prune(self) -> None:
        """Bounds the job entries to 20; the oldest `failed`/`cancelled` go first."""
        victims: list[_Job] = []
        with self._lock:
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
                if any(j.status is ExportStatus.DONE for j in victims):
                    self._write_index_locked()
            for job in victims:
                self._discard(job)
        for job in victims:
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
                if job.project is None or not job.status.active:
                    continue
                project = job.project
                if any(s.media_id == media_id for s in project.slides) or any(
                    c.media_id == media_id for c in project.music
                ):
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
            if job.project is None:
                raise RuntimeError("export job without a project snapshot")
            timeline = build_timeline(timeline_slides_from_project(job.project))
            audio_input = self._mix_music(job, job.project, timeline)
            try:
                export_movie(
                    timeline,
                    self._catalog,
                    job.profile,
                    job.output,
                    preview_loader(self._media),
                    progress=lambda fraction: self._on_progress(job, fraction),
                    cancel=job.cancel,
                    audio_input=audio_input,
                    shaders_dir=self._shaders_dir,
                    load_video=video_loader(self._media),
                    project_slides=job.project.slides,
                    effects=self._effects,
                )
            finally:
                (job.directory / MIX_FILENAME).unlink(missing_ok=True)
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
            with self._lock:
                cancelled = job.cancel.is_set()
                if cancelled:
                    # Finished while being cancelled: the user wanted to cancel.
                    job.status = ExportStatus.CANCELLED
                    victims = []
                else:
                    victims = self._finish_locked(job)
            if cancelled:
                self._discard(job)
                logger.info("Export %s cancelled", job.id)
                return
            for victim in victims:
                logger.info("Export %s removed (retention)", victim.id)
            logger.info("Export %s done: %s", job.id, job.output)

    def _mix_music(self, job: _Job, project: Project, timeline: Timeline) -> AudioInput:
        """Mixes the music of `project` into the job directory (design.md D6).

        Returns the `audio_input` for `export_movie`: the mixed `music.wav`, or
        the silent track if nothing of the music falls into the movie. The
        schedule uses the movie duration (as the preview does); the mix is
        padded or cut to the exact video duration (frames / fps).
        """
        if not project.music or job.cancel.is_set():
            return silent_audio_input
        durations: dict[str, float] = {}
        sources: dict[str, Path] = {}
        for clip in project.music:
            item = self._media.get(clip.media_id)
            if not isinstance(item, AudioItem):
                continue
            durations[item.id] = item.duration
            original = next(iter(sorted(self._media.item_dir(item.id).glob("original.*"))), None)
            if original is not None:
                sources[item.id] = original
        clips = [
            MusicClipInput(
                id=clip.id,
                media_id=clip.media_id,
                trim_start=clip.trim_start,
                trim_end=clip.trim_end,
                volume=clip.volume,
                fade_in=clip.fade_in,
                fade_out=clip.fade_out,
            )
            for clip in project.music
        ]
        segments = music_schedule(clips, durations, timeline.duration)
        if not segments:
            return silent_audio_input
        duration = video_duration(timeline, job.profile.spec.fps)
        mixed = mix_music(
            segments, sources, duration, job.directory / MIX_FILENAME, cancel=job.cancel
        )
        return file_audio_input(mixed)

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
                if job.status is ExportStatus.DONE:
                    self._write_index_locked()
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
                self._write_index_locked()
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
