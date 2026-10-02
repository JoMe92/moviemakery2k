"""Media store: import, validation and derived files (design.md D7; add-music-track D1).

A medium is an image or an audio file (`MediaItem`, discriminated by `kind`).
Layout in the data directory:

    media.json                  index, list of MediaItem in import order
    media/<id>/original.<ext>   unchanged original (jpg, png, webp; mp3, wav, m4a, ogg, flac)
    media/<id>/thumb.jpg        image: thumbnail, fits into 160x120
    media/<id>/preview.jpg      image: preview image, longest edge <= 1920, JPEG q90

Entries in media.json without `kind` (written before audio existed) are images.

Detection goes by content, never by name or content type: first Pillow (JPEG,
PNG, WebP only), then ffprobe for audio. Limits depend on the kind: images 25 MB
and 40 megapixels, audio 100 MB and 15 minutes.

The ID is uuid4().hex; the uploaded file name is only a display name and is
never used for a path. Transparency is flattened onto black in the JPEG
derivatives - matching the black monitor of the playback.
"""

import asyncio
import json
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, BinaryIO, Literal, get_args

from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter
from pydantic.alias_generators import to_camel

from mmy_backend.errors import ErrorCode, Params, error_message
from mmy_backend.ffmpeg import ffprobe_binary
from mmy_backend.storage import write_bytes_atomic

MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_AUDIO_BYTES = 100 * 1024 * 1024
MAX_AUDIO_SECONDS = 15 * 60
MAX_PIXELS = 40_000_000
MAX_FILES_PER_REQUEST = 50
THUMB_SIZE = (160, 120)
PREVIEW_MAX_EDGE = 1920
PREVIEW_QUALITY = 90
THUMB_QUALITY = 85
MAX_FILENAME_LENGTH = 255
FALLBACK_FILENAME = "image"
PROBE_TIMEOUT_SECONDS = 30

MEDIA_ID_PATTERN = r"^[0-9a-f]{32}$"
_MEDIA_ID_RE = re.compile(MEDIA_ID_PATTERN)

_CHUNK = 1024 * 1024
_EXTENSIONS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}

# ffprobe demuxer (first name of `format_name`) -> extension of the stored original.
_AUDIO_EXTENSIONS = {"mp3": "mp3", "wav": "wav", "mov": "m4a", "ogg": "ogg", "flac": "flac"}
# Decoders checked in the pixi FFmpeg (design.md, architect's pre-check); plus all pcm_*.
_AUDIO_CODECS = frozenset({"mp3", "aac", "alac", "flac", "vorbis", "opus"})

UploadErrorCode = Literal[
    ErrorCode.MEDIA_UNSUPPORTED_TYPE,
    ErrorCode.MEDIA_TOO_LARGE,
    ErrorCode.MEDIA_TOO_MANY_PIXELS,
    ErrorCode.MEDIA_AUDIO_TOO_LONG,
    ErrorCode.MEDIA_NO_AUDIO_STREAM,
    ErrorCode.MEDIA_PROBE_UNAVAILABLE,
]


_MAX_MEGAPIXELS = MAX_PIXELS // 1_000_000


def _megabytes(limit: int) -> int:
    return limit // (1024 * 1024)


class _MediaModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


class ImageItem(_MediaModel):
    """An imported picture (JPEG, PNG, WebP)."""

    id: Annotated[str, Field(pattern=MEDIA_ID_PATTERN)]
    kind: Literal["image"]
    filename: str = Field(description="Original file name, for display only")
    width: int = Field(description="Width after EXIF orientation")
    height: int = Field(description="Height after EXIF orientation")
    created_at: datetime
    thumbnail_url: str
    preview_url: str


class AudioItem(_MediaModel):
    """An imported audio file (MP3, WAV, M4A/AAC, OGG, FLAC), add-music-track D1."""

    id: Annotated[str, Field(pattern=MEDIA_ID_PATTERN)]
    kind: Literal["audio"]
    filename: str = Field(description="Original file name, for display only")
    duration: float = Field(gt=0, description="Duration in seconds")
    sample_rate: int = Field(gt=0, description="Sample rate of the original in Hz")
    channels: int = Field(gt=0, description="Number of channels of the original")
    codec: str = Field(description="FFmpeg codec name of the original, e.g. `mp3`, `pcm_s16le`")
    created_at: datetime
    audio_url: str = Field(description="Preview version (AAC in M4A, 48 kHz, stereo)")
    peaks_url: str = Field(description="Waveform data (50 peaks per second)")


type MediaItem = Annotated[ImageItem | AudioItem, Field(discriminator="kind")]
"""An imported medium; `kind` tells the type. Index entries without `kind` are images."""


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

    def __init__(self, code: UploadErrorCode, **params: int | float | str) -> None:
        self.code: UploadErrorCode = code
        self.params: Params = dict(params)
        super().__init__(error_message(code, self.params))


def _too_large(limit: int) -> MediaError:
    return MediaError(ErrorCode.MEDIA_TOO_LARGE, maxMegabytes=_megabytes(limit))


def _too_many_pixels() -> MediaError:
    return MediaError(ErrorCode.MEDIA_TOO_MANY_PIXELS, maxMegapixels=_MAX_MEGAPIXELS)


def _unsupported() -> MediaError:
    return MediaError(ErrorCode.MEDIA_UNSUPPORTED_TYPE)


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
class _PreparedImage:
    id: str
    width: int
    height: int


@dataclass(frozen=True, slots=True)
class AudioProbe:
    """What ffprobe reports about an accepted audio file."""

    extension: str
    duration: float
    sample_rate: int
    channels: int
    codec: str


@dataclass(frozen=True, slots=True)
class _PreparedAudio:
    id: str
    probe: AudioProbe


def _to_rgb(image: Image.Image) -> Image.Image:
    has_alpha = image.mode in ("RGBA", "LA", "PA", "RGBa", "La") or ("transparency" in image.info)
    if not has_alpha:
        return image if image.mode == "RGB" else image.convert("RGB")
    rgba = image.convert("RGBA")
    background = Image.new("RGB", rgba.size, (0, 0, 0))
    background.paste(rgba, mask=rgba.getchannel("A"))
    return background


def _copy_limited(source: BinaryIO, target: BinaryIO, limit: int) -> int:
    """Copies the upload and returns its size; stops one chunk beyond `limit`.

    A result above `limit` means "too large" (the copy is truncated then); which
    limit applies is only known once the kind has been detected.
    """
    total = 0
    while chunk := source.read(_CHUNK):
        total += len(chunk)
        target.write(chunk)
        if total > limit:
            break
    return total


def _is_image(path: Path) -> bool:
    """Does Pillow recognise a supported image format (JPEG, PNG, WebP)?

    Only the header is read, so a truncated upload still counts. Anything else
    goes to ffprobe.
    """
    try:
        with Image.open(path, formats=list(_EXTENSIONS)):
            return True
    except Image.DecompressionBombError:
        return True  # an image, rejected later as "too many pixels"
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, EOFError):
        return False


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def probe_audio(path: Path) -> AudioProbe:
    """Checks an audio file with ffprobe; raises MediaError if it is not acceptable.

    Accepted are the demuxers mp3, wav, mov/m4a, ogg and flac with at least one
    audio stream in a supported codec; the first such stream is described. The
    duration is ffprobe's value (stream, else container); the decoded length
    replaces it once a preview is derived (design.md D2).
    """
    binary = ffprobe_binary()
    if binary is None:
        raise MediaError(ErrorCode.MEDIA_PROBE_UNAVAILABLE)
    command = [
        binary,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        completed = subprocess.run(
            command, capture_output=True, timeout=PROBE_TIMEOUT_SECONDS, check=False
        )
    except subprocess.TimeoutExpired as exc:
        raise _unsupported() from exc
    except OSError as exc:
        raise MediaError(ErrorCode.MEDIA_PROBE_UNAVAILABLE) from exc
    if completed.returncode != 0:
        raise _unsupported()
    try:
        report = json.loads(completed.stdout)
    except ValueError as exc:
        raise _unsupported() from exc
    if not isinstance(report, dict):
        raise _unsupported()

    container = report.get("format") or {}
    demuxer = str(container.get("format_name", "")).split(",", 1)[0]
    extension = _AUDIO_EXTENSIONS.get(demuxer)
    if extension is None:
        raise _unsupported()
    streams = [s for s in report.get("streams") or [] if isinstance(s, dict)]
    audio = [s for s in streams if s.get("codec_type") == "audio"]
    if not audio:
        raise MediaError(ErrorCode.MEDIA_NO_AUDIO_STREAM)
    stream = next((s for s in audio if _supported_codec(str(s.get("codec_name", "")))), None)
    if stream is None:
        raise _unsupported()

    duration = _number(stream.get("duration")) or _number(container.get("duration"))
    sample_rate = _number(stream.get("sample_rate"))
    channels = _number(stream.get("channels"))
    if duration is None or sample_rate is None or channels is None:
        raise _unsupported()
    if duration > MAX_AUDIO_SECONDS:
        raise MediaError(ErrorCode.MEDIA_AUDIO_TOO_LONG, maxMinutes=MAX_AUDIO_SECONDS // 60)
    return AudioProbe(
        extension=extension,
        duration=duration,
        sample_rate=int(sample_rate),
        channels=int(channels),
        codec=str(stream["codec_name"]),
    )


def _supported_codec(name: str) -> bool:
    return name in _AUDIO_CODECS or name.startswith("pcm_")


def _read_index_payload(payload: bytes) -> list[MediaItem]:
    """Parses media.json; entries without `kind` are images (written before audio existed)."""
    raw = json.loads(payload)
    if isinstance(raw, list):
        raw = [
            {"kind": "image", **entry} if isinstance(entry, dict) and "kind" not in entry else entry
            for entry in raw
        ]
    return _INDEX_ADAPTER.validate_python(raw)


def _check_and_load(path: Path) -> tuple[str, Image.Image]:
    try:
        with Image.open(path) as probe:
            fmt = probe.format
            if fmt not in _EXTENSIONS:
                raise MediaError(ErrorCode.MEDIA_UNSUPPORTED_TYPE)
            width, height = probe.size
            if width * height > MAX_PIXELS:
                raise _too_many_pixels()
            probe.verify()
        # verify() makes the object unusable - reopen and load it completely.
        with Image.open(path) as opened:
            opened.load()
            oriented = ImageOps.exif_transpose(opened)
            oriented.load()
    except Image.DecompressionBombError as exc:
        raise _too_many_pixels() from exc
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
        return _read_index_payload(self.index_file.read_bytes())

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

    def _prepare(self, source: BinaryIO) -> _PreparedImage | _PreparedAudio:
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
                size = _copy_limited(source, target, max(MAX_IMAGE_BYTES, MAX_AUDIO_BYTES))
            if _is_image(upload):
                if size > MAX_IMAGE_BYTES:
                    raise _too_large(MAX_IMAGE_BYTES)
                prepared: _PreparedImage | _PreparedAudio = self._prepare_image(
                    media_id, staging, upload
                )
            else:
                if size > MAX_AUDIO_BYTES:
                    raise _too_large(MAX_AUDIO_BYTES)
                probe = probe_audio(upload)
                upload.rename(staging / f"original.{probe.extension}")
                prepared = _PreparedAudio(id=media_id, probe=probe)
            os.replace(staging, self.item_dir(media_id))
        except BaseException:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        return prepared

    @staticmethod
    def _prepare_image(media_id: str, staging: Path, upload: Path) -> _PreparedImage:
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
        return _PreparedImage(id=media_id, width=width, height=height)

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
        item: MediaItem
        if isinstance(prepared, _PreparedImage):
            item = ImageItem(
                id=prepared.id,
                kind="image",
                filename=display,
                width=prepared.width,
                height=prepared.height,
                created_at=datetime.now(UTC),
                thumbnail_url=f"/api/media/{prepared.id}/thumbnail",
                preview_url=f"/api/media/{prepared.id}/preview",
            )
        else:
            probe = prepared.probe
            item = AudioItem(
                id=prepared.id,
                kind="audio",
                filename=display,
                duration=probe.duration,
                sample_rate=probe.sample_rate,
                channels=probe.channels,
                codec=probe.codec,
                created_at=datetime.now(UTC),
                # Served by GET /api/media/{id}/audio and /peaks (design.md D2).
                audio_url=f"/api/media/{prepared.id}/audio",
                peaks_url=f"/api/media/{prepared.id}/peaks",
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
