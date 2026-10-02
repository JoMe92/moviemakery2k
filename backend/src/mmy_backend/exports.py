"""Export-Jobs (design.md D5, TASK-API-006).

Ein `ExportManager` pro App (app.state.exports) verwaltet die Jobs im Speicher:

- `start` nimmt einen Schnappschuss (tiefe Kopie) des gespeicherten Projekts und
  startet einen eigenen Worker-Thread. Höchstens ein Job ist `queued` oder
  `running`; ein zweiter Start wirft `ExportBusy` (→ 409).
- Der Worker ruft `export_movie` auf; GL-Kontext, Shader und FFmpeg entstehen
  in diesem Thread (EGL-Kontexte sind threadgebunden). Geschrieben wird nach
  `<data_dir>/exports/<id>/out.mp4.part`, bei Erfolg atomar nach `out.mp4`.
- Statusfolge: `queued` → `running` → `done` | `failed` | `cancelled`.
  Bei `failed` und `cancelled` wird das Job-Verzeichnis entfernt; es bleibt
  keine Datei zurück.
- `cancel` setzt das Abbruchsignal und wartet, bis der Worker aufgeräumt hat
  (FFmpeg beendet, Teildatei gelöscht). Der Job bleibt danach als `cancelled`
  abfragbar; `remove` löscht einen beendeten Job samt Dateien.
- `shutdown` (App-Lifespan) bricht laufende Jobs ab und wartet auf die Worker.

Aufbewahrung (TASK-API-007):

- Behalten werden höchstens die letzten 5 fertigen Exporte (`done`). Wird ein
  sechster fertig, werden der älteste fertige Export samt Dateien und sein Job
  gelöscht. `queued`/`running` werden nie entfernt.
- Insgesamt bleiben höchstens 20 Job-Einträge; darüber hinaus fallen zuerst die
  ältesten `failed`/`cancelled` weg (sie haben keine Dateien).
- Die Jobs liegen nur im Speicher; nach einem Neustart sind frühere Exporte
  über die API nicht mehr erreichbar. `cleanup_on_start` (App-Lifespan) leert
  daher `<data_dir>/exports/` vollständig: verwaiste Teildateien (`.part`)
  ebenso wie alte, unerreichbare Export-Verzeichnisse. Was entfernt wird,
  steht im Log.
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
from mmy_backend.errors import Params, error_message, validation_error
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
"""So viele fertige Exporte (mit Datei) werden höchstens aufbewahrt."""
MAX_JOB_ENTRIES = 20
"""So viele Job-Einträge (alle Status) werden höchstens aufbewahrt."""

CANCEL_TIMEOUT_SECONDS = 30.0
"""So lange wartet `cancel` höchstens auf das Aufräumen des Workers."""

MESSAGE_GL_UNAVAILABLE = error_message("export.glUnavailable")
MESSAGE_UNEXPECTED = error_message("export.unexpected")


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
    """Prüft den gewünschten Dateinamen (ohne Endung) und normalisiert ihn.

    Leerraum am Rand und eine angehängte Endung `.mp4` werden entfernt. Abgelehnt
    werden leere Namen, die Zeichen `/ \\ : * ? " < > |`, Steuerzeichen und Namen
    über 120 Zeichen.
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
            "Gewünschter Dateiname ohne Endung; `.mp4` wird beim Herunterladen angehängt. "
            'Nicht erlaubt: / \\ : * ? " < > | und Steuerzeichen.'
        ),
        examples=["Mein Film"],
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
        description="`high` = 960x720 (Standard), `small` = 640x480; beide 30 fps",
    )
    file_name: FileName


class ExportJob(_ExportModel):
    id: Annotated[str, Field(pattern=EXPORT_ID_PATTERN)]
    status: ExportStatus
    progress: float = Field(ge=0.0, le=1.0, description="Fortschritt 0..1")
    profile: ExportProfile
    file_name: str = Field(description="Dateiname ohne Endung")
    error: str | None = Field(description="English message when `failed`, otherwise null")
    error_code: str | None = Field(
        default=None, description="Stable error code when `failed` (design.md D5), otherwise null"
    )
    error_params: Params = Field(
        default_factory=dict, description="Values of the error message; empty without error"
    )
    created_at: datetime


class ExportListResponse(_ExportModel):
    items: list[ExportJob] = Field(description="Alle bekannten Exporte, älteste zuerst")


class ExportBusy(Exception):
    """Es läuft schon ein Export."""

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
    error: str | None = None
    error_code: str | None = None
    error_params: Params = field(default_factory=dict)
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
            error=self.error,
            error_code=self.error_code,
            error_params=dict(self.error_params),
            created_at=self.created_at,
        )


class ExportManager:
    """Export-Jobs im Speicher; eine Instanz pro App (app.state.exports)."""

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

    # --- Aufräumen -------------------------------------------------------------

    def cleanup_on_start(self) -> list[Path]:
        """Leert `exports/` beim Start (Jobs überleben keinen Neustart).

        Entfernt verwaiste `.part`-Dateien und alte Export-Verzeichnisse;
        liefert die entfernten Einträge. Nur vor dem ersten Job aufrufen.
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
                logger.warning("Verwaiste Teildatei entfernt: %s", entry)
            else:
                logger.info("Alter Export aus früherem Lauf entfernt: %s", entry)
        return removed

    def _prune(self) -> None:
        """Setzt die Aufbewahrung durch: ≤ 5 fertige Exporte, ≤ 20 Job-Einträge."""
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
            logger.info("Export %s entfernt (Aufbewahrung)", job.id)

    # --- Abfragen ---------------------------------------------------------------

    def list(self) -> list[ExportJob]:
        with self._lock:
            return [job.model() for job in self._jobs.values()]

    def get(self, export_id: str) -> ExportJob | None:
        with self._lock:
            job = self._jobs.get(export_id)
            return job.model() if job is not None else None

    def file_path(self, export_id: str) -> Path | None:
        """Pfad der fertigen Datei; nur bei Status `done`, sonst None."""
        with self._lock:
            job = self._jobs.get(export_id)
            if job is None or job.status is not ExportStatus.DONE:
                return None
            return job.output

    # --- Start ------------------------------------------------------------------

    def start(self, project: Project, profile: ExportProfile, file_name: str) -> ExportJob:
        """Legt einen Job mit Schnappschuss von `project` an und startet den Worker.

        Wirft ExportBusy, wenn ein Job `queued` oder `running` ist. Die Prüfung
        des Projekts (leer, fehlende Medien) ist Sache des Aufrufers.
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
        logger.info("Export %s gestartet (%s, %d Bilder)", export_id, profile, len(snapshot.slides))
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

    def _fail(self, job: _Job, code: str, params: Params) -> None:
        self._set(
            job,
            status=ExportStatus.FAILED,
            error=error_message(code, params),
            error_code=code,
            error_params=params,
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
            logger.info("Export %s abgebrochen", job.id)
        except ExportFailed as exc:
            self._discard(job)
            code: str
            params: Params
            if isinstance(exc.__cause__, RenderContextError):
                code, params = "export.glUnavailable", {"reason": str(exc.__cause__)}
            else:
                code, params = exc.code, exc.params
            logger.error("Export %s fehlgeschlagen: %s %s", job.id, exc, params)
            self._fail(job, code, params)
        except Exception:
            self._discard(job)
            logger.exception("Export %s unerwartet fehlgeschlagen", job.id)
            self._fail(job, "export.unexpected", {})
        else:
            self._set(job, status=ExportStatus.DONE, progress=1.0)
            logger.info("Export %s fertig: %s", job.id, job.output)

    @staticmethod
    def _discard(job: _Job) -> None:
        shutil.rmtree(job.directory, ignore_errors=True)

    # --- Abbrechen und Löschen ----------------------------------------------------

    def cancel(self, export_id: str, timeout: float = CANCEL_TIMEOUT_SECONDS) -> ExportJob | None:
        """Bricht einen Job ab bzw. löscht einen beendeten; None, wenn unbekannt.

        - `queued`/`running`: Abbruchsignal setzen und auf den Worker warten
          (blockiert, höchstens `timeout`). Danach ist der Job `cancelled`,
          ohne Teildatei, und bleibt abfragbar. Wurde er im selben Moment
          fertig, wird das Ergebnis verworfen: Der Benutzer wollte abbrechen.
        - `done`/`failed`/`cancelled`: Dateien und Job werden gelöscht.

        Liefert den Stand des Jobs nach der Aktion.
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
            logger.info("Export %s gelöscht", export_id)
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
        """Bricht laufende Jobs ab und wartet auf ihre Worker (App-Lifespan)."""
        with self._lock:
            threads = []
            for job in self._jobs.values():
                if job.status.active:
                    job.cancel.set()
                if job.thread is not None:
                    threads.append(job.thread)
        for thread in threads:
            thread.join(timeout)
