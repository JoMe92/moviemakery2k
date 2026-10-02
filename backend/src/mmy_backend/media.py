"""Medienspeicher: Import, Prüfung und abgeleitete Bilder (design.md D7).

Layout im Datenverzeichnis:

    media.json                  Index, Liste von MediaItem in Importreihenfolge
    media/<id>/original.<ext>   unverändertes Original (jpg, png oder webp)
    media/<id>/thumb.jpg        Thumbnail, passt in 160x120
    media/<id>/preview.jpg      Vorschaubild, längste Kante <= 1920, JPEG q90

Die ID ist uuid4().hex; der hochgeladene Dateiname ist nur Anzeigename und
wird nie für einen Pfad verwendet. Transparenz wird in den JPEG-Ableitungen
auf Schwarz gelegt - passend zum schwarzen Monitor der Wiedergabe.
"""

import asyncio
import os
import shutil
import tempfile
import unicodedata
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, BinaryIO, Literal

from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter
from pydantic.alias_generators import to_camel

MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_FILES_PER_REQUEST = 50
THUMB_SIZE = (160, 120)
PREVIEW_MAX_EDGE = 1920
PREVIEW_QUALITY = 90
THUMB_QUALITY = 85
MAX_FILENAME_LENGTH = 255
FALLBACK_FILENAME = "bild"

_CHUNK = 1024 * 1024
_EXTENSIONS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}

ErrorCode = Literal["unsupported", "too_large", "too_many_pixels"]

ERROR_MESSAGES: dict[ErrorCode, str] = {
    "unsupported": "Kein unterstütztes Bild (erlaubt sind JPEG, PNG und WebP).",
    "too_large": f"Die Datei ist zu groß (höchstens {MAX_FILE_BYTES // (1024 * 1024)} MB).",
    "too_many_pixels": (
        f"Das Bild hat zu viele Pixel (höchstens {MAX_PIXELS // 1_000_000} Megapixel)."
    ),
}


class _MediaModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


class MediaItem(_MediaModel):
    id: Annotated[str, Field(pattern=r"^[0-9a-f]{32}$")]
    filename: str = Field(description="Original-Dateiname, nur zur Anzeige")
    width: int = Field(description="Breite nach EXIF-Ausrichtung")
    height: int = Field(description="Höhe nach EXIF-Ausrichtung")
    created_at: datetime
    thumbnail_url: str
    preview_url: str


class MediaUploadSuccess(_MediaModel):
    filename: str
    ok: Literal[True]
    item: MediaItem


class MediaUploadFailure(_MediaModel):
    filename: str
    ok: Literal[False]
    error: ErrorCode
    message: str


# Absichtlich ohne Pydantic-Discriminator: dessen OpenAPI-Mapping hätte die
# Schlüssel "True"/"False". `ok` ist Pflichtfeld mit const true/false, das reicht
# TypeScript zum Eingrenzen.
MediaUploadResult = MediaUploadSuccess | MediaUploadFailure


class MediaUploadResponse(_MediaModel):
    items: list[MediaUploadResult]


_INDEX_ADAPTER = TypeAdapter(list[MediaItem])


class MediaError(Exception):
    """Eine Datei wird abgelehnt; `code` geht als Fehlercode an den Client."""

    def __init__(self, code: ErrorCode) -> None:
        super().__init__(ERROR_MESSAGES[code])
        self.code: ErrorCode = code


def sanitize_filename(raw: str | None) -> str:
    """Nur der letzte Pfadteil, ohne Steuerzeichen, höchstens 255 Zeichen."""
    name = (raw or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(ch for ch in name if unicodedata.category(ch) not in ("Cc", "Cf"))
    name = name.strip()
    if name in ("", ".", ".."):
        return FALLBACK_FILENAME
    return name[:MAX_FILENAME_LENGTH]


@dataclass(frozen=True, slots=True)
class _Prepared:
    id: str
    width: int
    height: int


def _to_rgb(image: Image.Image) -> Image.Image:
    has_alpha = image.mode in ("RGBA", "LA", "PA", "RGBa", "La") or ("transparency" in image.info)
    if not has_alpha:
        return image if image.mode == "RGB" else image.convert("RGB")
    rgba = image.convert("RGBA")
    background = Image.new("RGB", rgba.size, (0, 0, 0))
    background.paste(rgba, mask=rgba.getchannel("A"))
    return background


def _copy_limited(source: BinaryIO, target: BinaryIO) -> None:
    """Kopiert höchstens MAX_FILE_BYTES; liest nie mehr als ein Stück darüber hinaus."""
    total = 0
    while chunk := source.read(_CHUNK):
        total += len(chunk)
        if total > MAX_FILE_BYTES:
            raise MediaError("too_large")
        target.write(chunk)


def _check_and_load(path: Path) -> tuple[str, Image.Image]:
    try:
        with Image.open(path) as probe:
            fmt = probe.format
            if fmt not in _EXTENSIONS:
                raise MediaError("unsupported")
            width, height = probe.size
            if width * height > MAX_PIXELS:
                raise MediaError("too_many_pixels")
            probe.verify()
        # verify() macht das Objekt unbrauchbar - neu öffnen und vollständig laden.
        with Image.open(path) as opened:
            opened.load()
            oriented = ImageOps.exif_transpose(opened)
            oriented.load()
    except Image.DecompressionBombError as exc:
        raise MediaError("too_many_pixels") from exc
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, EOFError) as exc:
        raise MediaError("unsupported") from exc
    return _EXTENSIONS[fmt], oriented


class MediaStore:
    """Medien im Datenverzeichnis; eine Instanz pro App (app.state.media)."""

    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.media_dir = data_dir / "media"
        self.index_file = data_dir / "media.json"
        self._lock = asyncio.Lock()
        self._items: list[MediaItem] = self._read_index()

    def _read_index(self) -> list[MediaItem]:
        if not self.index_file.exists():
            return []
        return _INDEX_ADAPTER.validate_json(self.index_file.read_bytes())

    def list(self) -> list[MediaItem]:
        """Alle Medien in Importreihenfolge."""
        return list(self._items)

    def item_dir(self, media_id: str) -> Path:
        return self.media_dir / media_id

    def _write_index(self, items: Sequence[MediaItem]) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        payload = _INDEX_ADAPTER.dump_json(list(items), indent=2, by_alias=True)
        fd, tmp_name = tempfile.mkstemp(prefix=".media-", suffix=".json", dir=self.data_dir)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_name, self.index_file)
        except BaseException:
            Path(tmp_name).unlink(missing_ok=True)
            raise

    def _prepare(self, source: BinaryIO) -> _Prepared:
        """Prüft eine Datei und legt Original + Ableitungen unter media/<id>/ ab.

        Läuft synchron (Threadpool). Erst wird in ein Staging-Verzeichnis
        geschrieben und dieses dann umbenannt; bei einem Fehler bleibt nichts liegen.
        """
        self.media_dir.mkdir(parents=True, exist_ok=True)
        media_id = uuid.uuid4().hex
        staging = Path(tempfile.mkdtemp(prefix=".incoming-", dir=self.media_dir))
        try:
            upload = staging / "upload"
            with upload.open("wb") as target:
                _copy_limited(source, target)
            ext, image = _check_and_load(upload)
            with image:
                rgb = _to_rgb(image)
                width, height = rgb.size
                preview = rgb.copy()
                preview.thumbnail((PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE), Image.Resampling.LANCZOS)
                preview.save(staging / "preview.jpg", "JPEG", quality=PREVIEW_QUALITY)
                thumb = rgb.copy()
                thumb.thumbnail(THUMB_SIZE, Image.Resampling.LANCZOS)
                thumb.save(staging / "thumb.jpg", "JPEG", quality=THUMB_QUALITY)
            upload.rename(staging / f"original.{ext}")
            os.replace(staging, self.item_dir(media_id))
        except BaseException:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        return _Prepared(id=media_id, width=width, height=height)

    def import_file(self, source: BinaryIO, filename: str | None) -> MediaUploadResult:
        """Verarbeitet eine Datei synchron; gehört in den Threadpool."""
        display = sanitize_filename(filename)
        try:
            prepared = self._prepare(source)
        except MediaError as exc:
            return MediaUploadFailure(filename=display, ok=False, error=exc.code, message=str(exc))
        item = MediaItem(
            id=prepared.id,
            filename=display,
            width=prepared.width,
            height=prepared.height,
            created_at=datetime.now(UTC),
            thumbnail_url=f"/api/media/{prepared.id}/thumbnail",
            preview_url=f"/api/media/{prepared.id}/preview",
        )
        return MediaUploadSuccess(filename=display, ok=True, item=item)

    async def add(self, items: Sequence[MediaItem]) -> None:
        """Hängt importierte Medien an und schreibt den Index atomar."""
        if not items:
            return
        async with self._lock:
            updated = [*self._items, *items]
            await asyncio.to_thread(self._write_index, updated)
            self._items = updated
