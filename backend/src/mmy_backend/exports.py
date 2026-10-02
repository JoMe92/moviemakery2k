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

Aufbewahrung der letzten 5 Exporte und das Aufräumen beim Start folgen in
TASK-API-007.
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

CANCEL_TIMEOUT_SECONDS = 30.0
"""So lange wartet `cancel` höchstens auf das Aufräumen des Workers."""

MESSAGE_GL_UNAVAILABLE = (
    "Der Export ist auf diesem System nicht verfügbar: Es konnte kein OpenGL-Kontext "
    "für das Rendern erzeugt werden. Unterstützt wird Linux mit Software-Rendering "
    "(Mesa llvmpipe)."
)
MESSAGE_UNEXPECTED = "Der Export ist unerwartet fehlgeschlagen."


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
        raise ValueError("Der Dateiname darf nicht leer sein.")
    forbidden = sorted({ch for ch in name if ch in FORBIDDEN_FILE_NAME_CHARS})
    if forbidden:
        raise ValueError(
            "Der Dateiname enthält unerlaubte Zeichen: "
            + " ".join(forbidden)
            + ' (nicht erlaubt sind / \\ : * ? " < > |).'
        )
    if any(unicodedata.category(ch) in ("Cc", "Cf") for ch in name):
        raise ValueError("Der Dateiname enthält Steuerzeichen.")
    if name in (".", ".."):
        raise ValueError("Der Dateiname ist ungültig.")
    if len(name) > MAX_FILE_NAME_LENGTH:
        raise ValueError(f"Der Dateiname ist zu lang (höchstens {MAX_FILE_NAME_LENGTH} Zeichen).")
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
    error: str | None = Field(description="Verständliche Meldung bei `failed`, sonst null")
    created_at: datetime


class ExportListResponse(_ExportModel):
    items: list[ExportJob] = Field(description="Alle bekannten Exporte, älteste zuerst")


class ExportBusy(Exception):
    """Es läuft schon ein Export."""

    def __init__(self, job: ExportJob) -> None:
        super().__init__("Es läuft bereits ein Export. Bitte warten oder ihn zuerst abbrechen.")
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

    def _run(self, job: _Job) -> None:
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
            if isinstance(exc.__cause__, RenderContextError):
                message = MESSAGE_GL_UNAVAILABLE
            else:
                message = str(exc).split("\n", 1)[0]
            logger.error("Export %s fehlgeschlagen: %s", job.id, exc)
            self._set(job, status=ExportStatus.FAILED, error=message)
        except Exception:
            self._discard(job)
            logger.exception("Export %s unerwartet fehlgeschlagen", job.id)
            self._set(job, status=ExportStatus.FAILED, error=MESSAGE_UNEXPECTED)
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
