"""Media store: import, validation and derived images (design.md D7).

Layout in the data directory:

    media.json                  index, list of MediaItem in import order
    media/<id>/original.<ext>   unchanged original (jpg, png or webp)
    media/<id>/thumb.jpg        thumbnail, fits into 160x120
    media/<id>/preview.jpg      preview image, longest edge <= 1920, JPEG q90

The ID is uuid4().hex; the uploaded file name is only a display name and is
never used for a path. Transparency is flattened onto black in the JPEG
derivatives - matching the black monitor of the playback.
"""

import asyncio
import os
import re
import shutil
import tempfile
import unicodedata
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, BinaryIO, Literal, get_args

from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter
from pydantic.alias_generators import to_camel

from mmy_backend.errors import ErrorCode, Params, error_message
from mmy_backend.storage import write_bytes_atomic

MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_FILES_PER_REQUEST = 50
THUMB_SIZE = (160, 120)
PREVIEW_MAX_EDGE = 1920
PREVIEW_QUALITY = 90
THUMB_QUALITY = 85
MAX_FILENAME_LENGTH = 255
FALLBACK_FILENAME = "image"

MEDIA_ID_PATTERN = r"^[0-9a-f]{32}$"
_MEDIA_ID_RE = re.compile(MEDIA_ID_PATTERN)

_CHUNK = 1024 * 1024
_EXTENSIONS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}

UploadErrorCode = Literal[
    ErrorCode.MEDIA_UNSUPPORTED_TYPE, ErrorCode.MEDIA_TOO_LARGE, ErrorCode.MEDIA_TOO_MANY_PIXELS
]

UPLOAD_ERROR_PARAMS: dict[UploadErrorCode, Params] = {
    ErrorCode.MEDIA_UNSUPPORTED_TYPE: {},
    ErrorCode.MEDIA_TOO_LARGE: {"maxMegabytes": MAX_FILE_BYTES // (1024 * 1024)},
    ErrorCode.MEDIA_TOO_MANY_PIXELS: {"maxMegapixels": MAX_PIXELS // 1_000_000},
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
    id: Annotated[str, Field(pattern=MEDIA_ID_PATTERN)]
    filename: str = Field(description="Original file name, for display only")
    width: int = Field(description="Width after EXIF orientation")
    height: int = Field(description="Height after EXIF orientation")
    created_at: datetime
    thumbnail_url: str
    preview_url: str


class MediaUploadSuccess(_MediaModel):
    filename: str
    ok: Literal[True]
    item: MediaItem


class MediaUploadFailure(_MediaModel):
    # The error fields are always sent; mark them required in the schema (design.md D3).
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)

    filename: str
    ok: Literal[False]
    error_code: ErrorCode = Field(
        description="Stable error code (design.md D3, D4); one of "
        + ", ".join(code.value for code in get_args(UploadErrorCode))
    )
    error_params: Params = Field(default_factory=dict, description="Values of the message")
    message: str = Field(description="English message")


# Deliberately without a Pydantic discriminator: its OpenAPI mapping would have the
# keys "True"/"False". `ok` is a required field with const true/false, which is
# enough for TypeScript to narrow.
MediaUploadResult = MediaUploadSuccess | MediaUploadFailure


class MediaUploadResponse(_MediaModel):
    items: list[MediaUploadResult]


class MediaListResponse(_MediaModel):
    items: list[MediaItem] = Field(description="All media in import order")


_INDEX_ADAPTER = TypeAdapter(list[MediaItem])


class MediaError(Exception):
    """A file is rejected; `code` goes to the client as its error code."""

    def __init__(self, code: UploadErrorCode) -> None:
        self.code: UploadErrorCode = code
        self.params: Params = dict(UPLOAD_ERROR_PARAMS[code])
        super().__init__(error_message(code, self.params))


def is_media_id(value: str) -> bool:
    """Does `value` have the format of a media ID (uuid4().hex)? Only then is a path built."""
    return _MEDIA_ID_RE.fullmatch(value) is not None


def sanitize_filename(raw: str | None) -> str:
    """Only the last path component, without control characters, at most 255 characters."""
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
    """Copies at most MAX_FILE_BYTES; never reads more than one chunk beyond that."""
    total = 0
    while chunk := source.read(_CHUNK):
        total += len(chunk)
        if total > MAX_FILE_BYTES:
            raise MediaError(ErrorCode.MEDIA_TOO_LARGE)
        target.write(chunk)


def _check_and_load(path: Path) -> tuple[str, Image.Image]:
    try:
        with Image.open(path) as probe:
            fmt = probe.format
            if fmt not in _EXTENSIONS:
                raise MediaError(ErrorCode.MEDIA_UNSUPPORTED_TYPE)
            width, height = probe.size
            if width * height > MAX_PIXELS:
                raise MediaError(ErrorCode.MEDIA_TOO_MANY_PIXELS)
            probe.verify()
        # verify() makes the object unusable - reopen and load it completely.
        with Image.open(path) as opened:
            opened.load()
            oriented = ImageOps.exif_transpose(opened)
            oriented.load()
    except Image.DecompressionBombError as exc:
        raise MediaError(ErrorCode.MEDIA_TOO_MANY_PIXELS) from exc
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, EOFError) as exc:
        raise MediaError(ErrorCode.MEDIA_UNSUPPORTED_TYPE) from exc
    return _EXTENSIONS[fmt], oriented


class MediaStore:
    """Media in the data directory; one instance per app (app.state.media)."""

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
        """All media in import order."""
        return list(self._items)

    def get(self, media_id: str) -> MediaItem | None:
        """The medium with this ID or None (also for an invalid ID format)."""
        if not is_media_id(media_id):
            return None
        return next((item for item in self._items if item.id == media_id), None)

    def item_dir(self, media_id: str) -> Path:
        if not is_media_id(media_id):
            raise ValueError(f"Invalid media ID: {media_id!r}")
        return self.media_dir / media_id

    def _write_index(self, items: Sequence[MediaItem]) -> None:
        payload = _INDEX_ADAPTER.dump_json(list(items), indent=2, by_alias=True)
        write_bytes_atomic(self.index_file, payload)

    def _prepare(self, source: BinaryIO) -> _Prepared:
        """Validates a file and stores original + derivatives under media/<id>/.

        Runs synchronously (thread pool). It first writes into a staging directory
        and then renames it; on an error nothing is left behind.
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
        """Processes a file synchronously; belongs in the thread pool."""
        display = sanitize_filename(filename)
        try:
            prepared = self._prepare(source)
        except MediaError as exc:
            return MediaUploadFailure(
                filename=display,
                ok=False,
                error_code=exc.code,
                error_params=exc.params,
                message=str(exc),
            )
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
        """Appends imported media and writes the index atomically."""
        if not items:
            return
        async with self._lock:
            updated = [*self._items, *items]
            await asyncio.to_thread(self._write_index, updated)
            self._items = updated

    async def remove(self, media_id: str) -> bool:
        """Removes a medium from the index and deletes its directory.

        The index is written atomically first, then the directory is deleted
        (an already missing directory is not an error). Returns False if the
        ID is unknown. The cascade into the project is the caller's job.
        """
        if not is_media_id(media_id):
            return False
        async with self._lock:
            if not any(item.id == media_id for item in self._items):
                return False
            updated = [item for item in self._items if item.id != media_id]
            await asyncio.to_thread(self._write_index, updated)
            self._items = updated
            await asyncio.to_thread(shutil.rmtree, self.item_dir(media_id), ignore_errors=True)
            return True
