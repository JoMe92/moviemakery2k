"""Video import: detection, limits, data model and poster (TASK-API-016, TASK-API-017,
design.md D1, D2, D3).

The video fixtures are generated with the FFmpeg of the pixi environment at
test time (tiny lavfi test patterns), so no binary test data is committed.
"""

import io
import json
import struct
import subprocess
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from mmy_backend import media
from mmy_backend.config import Settings
from mmy_backend.ffmpeg import ffmpeg_binary
from mmy_backend.main import create_app
from mmy_backend.media import MediaStore, VideoItem

# name -> (container extension, extra ffmpeg output args, codec reported by ffprobe,
#          extension the original is stored under, after detection)
FORMATS: dict[str, tuple[str, list[str], str, str]] = {
    "h264": (
        "mp4",
        ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"],
        "h264",
        "mp4",
    ),
    "hevc": (
        "mp4",
        ["-c:v", "libx265", "-pix_fmt", "yuv420p", "-tag:v", "hvc1", "-movflags", "+faststart"],
        "hevc",
        "mp4",
    ),
    "vp9": ("webm", ["-c:v", "libvpx-vp9"], "vp9", "mkv"),
    "av1": ("mkv", ["-c:v", "libaom-av1", "-cpu-used", "8"], "av1", "mkv"),
}


def _ffmpeg() -> str:
    binary = ffmpeg_binary()
    assert binary is not None, "FFmpeg is part of the pixi environment"
    return binary


def _run_ffmpeg(tmp_path: Path, name: str, args: list[str]) -> bytes:
    out = tmp_path / "fixtures" / name
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [_ffmpeg(), "-v", "error", "-y", *args, str(out)], check=True, capture_output=True
    )
    return out.read_bytes()


def _test_pattern(
    tmp_path: Path,
    fmt: str,
    seconds: float = 1.0,
    size: str = "64x48",
    rate: int = 10,
) -> bytes:
    ext, extra, _, _ = FORMATS[fmt]
    source = f"testsrc=duration={seconds}:size={size}:rate={rate}"
    return _run_ffmpeg(
        tmp_path,
        f"{fmt}-{seconds}-{size}.{ext}",
        ["-f", "lavfi", "-i", source, *extra],
    )


def _audio_only_mp4(tmp_path: Path, seconds: float = 1.0) -> bytes:
    """An mp4/mov container (same demuxer family as video) with only an AAC track."""
    return _run_ffmpeg(
        tmp_path,
        "audio-only.mp4",
        ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", "-c:a", "aac"],
    )


def _subtitle_only_mp4(tmp_path: Path) -> bytes:
    """An mp4/mov container with neither a video nor an audio stream."""
    srt = tmp_path / "sub.srt"
    srt.write_text("1\n00:00:00,000 --> 00:00:01,000\nhello\n\n", encoding="utf-8")
    return _run_ffmpeg(tmp_path, "subs-only.mp4", ["-i", str(srt), "-c:s", "mov_text"])


def _mjpeg_mp4(tmp_path: Path, seconds: float = 1.0) -> bytes:
    """A video stream in a codec outside the supported allowlist (no audio either)."""
    return _run_ffmpeg(
        tmp_path,
        "mjpeg.mp4",
        [
            "-f",
            "lavfi",
            "-i",
            f"testsrc=duration={seconds}:size=64x48:rate=10",
            "-c:v",
            "mjpeg",
        ],
    )


def _two_color_mp4(
    tmp_path: Path, name: str, first_seconds: float, second_seconds: float, rate: int = 20
) -> bytes:
    """A video that is plain red for `first_seconds`, then plain blue for
    `second_seconds` (concatenated), so the poster frame's color reveals which
    moment FFmpeg actually extracted."""
    out = tmp_path / "fixtures" / name
    out.parent.mkdir(parents=True, exist_ok=True)
    command = [
        _ffmpeg(),
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c=red:size=64x48:rate={rate}:duration={first_seconds}",
        "-f",
        "lavfi",
        "-i",
        f"color=c=blue:size=64x48:rate={rate}:duration={second_seconds}",
        "-filter_complex",
        "[0:v]format=yuv420p[a];[1:v]format=yuv420p[b];[a][b]concat=n=2:v=1:a=0[v]",
        "-map",
        "[v]",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(out),
    ]
    subprocess.run(command, check=True, capture_output=True)
    return out.read_bytes()


def _center_color(path: Path, width: int = 64, height: int = 48) -> str:
    """ "red" or "blue", whichever channel dominates the center pixel.

    Tolerant of JPEG compression rounding (e.g. 255 -> 254), unlike an exact
    RGB comparison.
    """
    raw = path.with_suffix(".center.raw")
    subprocess.run(
        [
            _ffmpeg(),
            "-v",
            "error",
            "-y",
            "-i",
            str(path),
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            str(raw),
        ],
        check=True,
        capture_output=True,
    )
    data = raw.read_bytes()
    raw.unlink()
    index = ((height // 2) * width + width // 2) * 3
    red, _green, blue = data[index], data[index + 1], data[index + 2]
    return "red" if red > blue else "blue"


def _find_tkhd(data: bytearray) -> int:
    """Byte offset of the first `tkhd` box inside an mp4/mov's `moov` atom."""

    def walk(start: int, end: int) -> int | None:
        pos = start
        while pos + 8 <= end:
            size = struct.unpack(">I", data[pos : pos + 4])[0]
            typ = bytes(data[pos + 4 : pos + 8])
            if typ in (b"moov", b"trak"):
                found = walk(pos + 8, pos + size)
                if found is not None:
                    return found
            elif typ == b"tkhd":
                return pos
            pos += size
        return None

    found = walk(0, len(data))
    assert found is not None, "no tkhd box found"
    return found


def _rotate_90(path: Path) -> None:
    """Patches the first track's `tkhd` matrix to a +-90 degree rotation, as a
    real device's container-level rotation metadata would be (no FFmpeg build
    in this environment can write one on encode, so the test patches the box
    directly instead of shipping a binary fixture)."""
    data = bytearray(path.read_bytes())
    pos = _find_tkhd(data)
    body_start = pos + 8
    version = data[body_start]
    matrix_off = body_start + (40 if version == 0 else 52)
    # Verified against this FFmpeg's own ffprobe/autorotate: swaps width/height
    # and reports `rotation` (sign per av_display_rotation_get's convention).
    matrix = struct.pack(">9i", 0, 65536, 0, -65536, 0, 0, 0, 0, 1 << 30)
    data[matrix_off : matrix_off + 36] = matrix
    path.write_bytes(data)


def _upload(client: TestClient, files: list[tuple[str, bytes]]) -> Any:
    res = client.post(
        "/api/media",
        files=[("files", (name, data, "application/octet-stream")) for name, data in files],
    )
    assert res.status_code == 200, res.text
    return res.json()["items"]


def _files_under(root: Path) -> set[Path]:
    return {p for p in root.rglob("*") if p.is_file()} if root.exists() else set()


@pytest.fixture
def client(settings: Settings) -> Any:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


# --- Import per codec ------------------------------------------------------------------


@pytest.mark.parametrize("fmt", list(FORMATS))
def test_video_is_imported_with_metadata_and_original(
    fmt: str, client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    container_ext, _, codec, stored_ext = FORMATS[fmt]
    data = _test_pattern(tmp_path, fmt, seconds=1.5)
    [result] = _upload(client, [(f"clip.{container_ext}", data)])

    assert result["ok"] is True, result
    item = result["item"]
    media_id = item["id"]
    assert set(item) == {
        "id",
        "kind",
        "filename",
        "duration",
        "width",
        "height",
        "codec",
        "createdAt",
        "posterUrl",
    }
    assert item["kind"] == "video"
    assert item["filename"] == f"clip.{container_ext}"
    assert item["duration"] == pytest.approx(1.5, abs=0.2)
    assert (item["width"], item["height"]) == (64, 48)
    assert item["codec"] == codec
    assert item["posterUrl"] == f"/api/media/{media_id}/poster"

    # The original is stored unchanged under a name derived from its content.
    item_dir = settings.data_dir / "media" / media_id
    assert sorted(p.name for p in item_dir.iterdir()) == sorted(
        [f"original.{stored_ext}", "poster.jpg"]
    )
    assert (item_dir / f"original.{stored_ext}").read_bytes() == data

    index = json.loads((settings.data_dir / "media.json").read_text(encoding="utf-8"))
    assert index[0]["kind"] == "video"
    [stored] = MediaStore(settings.data_dir).list()
    assert isinstance(stored, VideoItem)
    assert stored.codec == codec

    listed = client.get("/api/media").json()["items"]
    assert listed == [item]


def test_detection_ignores_the_file_name(client: TestClient, tmp_path: Path) -> None:
    data = _test_pattern(tmp_path, "h264")
    [as_mp4, as_txt] = _upload(client, [("clip.mp4", data), ("notes.txt", data)])
    assert as_mp4["ok"] and as_txt["ok"]
    assert as_mp4["item"]["codec"] == as_txt["item"]["codec"] == "h264"
    assert as_mp4["item"]["kind"] == as_txt["item"]["kind"] == "video"


def test_mixed_import_sorts_by_kind(client: TestClient, tmp_path: Path) -> None:
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (16, 12), (10, 20, 30)).save(buf, "JPEG")
    jpeg = buf.getvalue()

    items = _upload(
        client,
        [("a.jpg", jpeg), ("b.mp4", _test_pattern(tmp_path, "h264")), ("c.jpg", jpeg)],
    )
    assert [r["item"]["kind"] for r in items] == ["image", "video", "image"]


# --- Limits -----------------------------------------------------------------------------


def test_default_video_limits() -> None:
    assert media.MAX_VIDEO_BYTES == 500 * 1024 * 1024
    assert media.MAX_VIDEO_SECONDS == 10 * 60


def test_too_long_video_is_rejected_and_nothing_stored(
    client: TestClient,
    settings: Settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 5 s as the limit instead of 10 minutes, so the fixtures stay small.
    monkeypatch.setattr(media, "MAX_VIDEO_SECONDS", 5)
    long_file = _test_pattern(tmp_path, "h264", seconds=6.0)
    fits = _test_pattern(tmp_path, "h264", seconds=4.0)

    items = _upload(client, [("long.mp4", long_file), ("fits.mp4", fits)])

    assert items[0] == {
        "filename": "long.mp4",
        "ok": False,
        "errorCode": "media.videoTooLong",
        "errorParams": {"maxMinutes": 0},
        "message": "The video file is too long (at most 0 minutes).",
    }
    assert items[1]["ok"] is True
    stored = {p.relative_to(settings.data_dir).parts[:2] for p in _files_under(settings.data_dir)}
    assert stored == {("media.json",), ("media", items[1]["item"]["id"])}


def test_video_over_size_limit_is_too_large(
    client: TestClient, settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(media, "MAX_VIDEO_BYTES", 2 * 1024)
    data = _test_pattern(tmp_path, "h264", seconds=2.0)
    assert len(data) > media.MAX_VIDEO_BYTES
    [result] = _upload(client, [("big.mp4", data)])
    assert result["errorCode"] == "media.tooLarge"
    assert result["errorParams"] == {"maxMegabytes": 0}
    assert _files_under(settings.data_dir) == set()


# --- Content checks ---------------------------------------------------------------------


def test_audio_only_mp4_is_imported_as_audio(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    """A video-capable container without a video stream still counts as audio
    (design.md D1, tasks.md TASK-API-016 acceptance)."""
    [result] = _upload(client, [("clip.mp4", _audio_only_mp4(tmp_path))])
    assert result["ok"] is True, result
    assert result["item"]["kind"] == "audio"
    assert result["item"]["codec"] == "aac"


def test_file_without_any_usable_stream_has_no_audio_stream(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    [result] = _upload(client, [("empty.m4a", _subtitle_only_mp4(tmp_path))])
    assert result == {
        "filename": "empty.m4a",
        "ok": False,
        "errorCode": "media.noAudioStream",
        "errorParams": {},
        "message": "The file contains no audio track.",
    }
    assert _files_under(settings.data_dir) == set()


def test_video_stream_in_unsupported_codec_has_no_video_stream(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    [result] = _upload(client, [("clip.mp4", _mjpeg_mp4(tmp_path))])
    assert result == {
        "filename": "clip.mp4",
        "ok": False,
        "errorCode": "media.noVideoStream",
        "errorParams": {},
        "message": "The file contains no decodable video track in a supported codec.",
    }
    assert _files_under(settings.data_dir) == set()


def test_missing_ffprobe_reports_probe_unavailable_for_video(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(media, "ffprobe_binary", lambda: None)
    [result] = _upload(client, [("clip.mp4", _test_pattern(tmp_path, "h264"))])
    assert result["errorCode"] == "media.probeUnavailable"


# --- Poster (TASK-API-017, design.md D3) -------------------------------------------------


def test_poster_at_two_seconds_or_more_is_extracted_at_one_second(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    # Exactly 2 s: the boundary still uses the 1 s rule, not the half-duration one.
    data = _two_color_mp4(tmp_path, "boundary.mp4", first_seconds=0.9, second_seconds=1.1)
    [result] = _upload(client, [("clip.mp4", data)])
    assert result["ok"] is True, result
    item = result["item"]
    assert item["duration"] == pytest.approx(2.0, abs=0.05)
    poster = settings.data_dir / "media" / item["id"] / "poster.jpg"
    assert _center_color(poster) == "blue"  # the 1 s mark, not the half (1 s too)


def test_poster_under_two_seconds_is_extracted_at_half_duration(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    # 1.6 s total: half (0.8 s) is still red, the literal 1 s mark is already blue -
    # the two rules disagree here, so this proves half-duration is actually used.
    data = _two_color_mp4(tmp_path, "short.mp4", first_seconds=0.9, second_seconds=0.7)
    [result] = _upload(client, [("clip.mp4", data)])
    assert result["ok"] is True, result
    item = result["item"]
    assert item["duration"] == pytest.approx(1.6, abs=0.05)
    poster = settings.data_dir / "media" / item["id"] / "poster.jpg"
    assert _center_color(poster) == "red"  # the half-duration mark (0.8 s)


def test_poster_of_a_rotated_video_is_upright_and_matches_reported_size(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    data = bytearray(_test_pattern(tmp_path, "h264", seconds=1.5))
    path = tmp_path / "fixtures" / "rotated.mp4"
    path.write_bytes(data)
    _rotate_90(path)

    [result] = _upload(client, [("rotated.mp4", path.read_bytes())])
    assert result["ok"] is True, result
    item = result["item"]
    # The source is 64x48 (landscape); rotated by +-90 degrees it is portrait.
    assert (item["width"], item["height"]) == (48, 64)

    poster = settings.data_dir / "media" / item["id"] / "poster.jpg"
    with Image.open(poster) as image:
        assert image.size == (item["width"], item["height"])


def test_poster_is_a_jpeg_at_the_image_preview_quality(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    [result] = _upload(client, [("clip.mp4", _test_pattern(tmp_path, "h264", seconds=2.0))])
    poster = settings.data_dir / "media" / result["item"]["id"] / "poster.jpg"
    with Image.open(poster) as image:
        assert image.format == "JPEG"
        assert image.size == (64, 48)
        poster_quantization = image.quantization  # type: ignore[attr-defined]

    # Quantization tables are a deterministic function of the quality setting
    # (independent of image content), so this confirms the same quality as
    # image previews/thumbnails (PREVIEW_QUALITY) without a brittle byte compare.
    reference = io.BytesIO()
    Image.new("RGB", (64, 48), (10, 20, 30)).save(reference, "JPEG", quality=media.PREVIEW_QUALITY)
    reference.seek(0)
    with Image.open(reference) as ref_image:
        assert poster_quantization == ref_image.quantization  # type: ignore[attr-defined]


def test_poster_endpoint_serves_immutable_jpeg(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    [result] = _upload(client, [("clip.mp4", _test_pattern(tmp_path, "h264"))])
    item = result["item"]

    res = client.get(item["posterUrl"])
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/jpeg"
    assert res.headers["cache-control"] == "public, max-age=31536000, immutable"
    item_dir = settings.data_dir / "media" / item["id"]
    assert res.content == (item_dir / "poster.jpg").read_bytes()


def test_poster_endpoint_is_404_for_images_audio_and_unknown_ids(
    client: TestClient, tmp_path: Path
) -> None:
    image = io.BytesIO()
    Image.new("RGB", (16, 12), (1, 2, 3)).save(image, "JPEG")
    sine = _run_ffmpeg(
        tmp_path, "tone.mp3", ["-f", "lavfi", "-i", "sine=duration=1", "-c:a", "libmp3lame"]
    )
    [as_image, as_audio] = _upload(client, [("a.jpg", image.getvalue()), ("tone.mp3", sine)])
    for media_id in (as_image["item"]["id"], as_audio["item"]["id"], "f" * 32, "not-an-id"):
        res = client.get(f"/api/media/{media_id}/poster")
        assert res.status_code == 404, media_id
        assert res.json()["detail"]["code"] == "media.notFound"


def test_missing_ffmpeg_rejects_video_without_leftovers(
    client: TestClient, settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(media, "ffmpeg_binary", lambda: None)
    [result] = _upload(client, [("clip.mp4", _test_pattern(tmp_path, "h264"))])
    assert result["errorCode"] == "media.probeUnavailable"
    assert _files_under(settings.data_dir) == set()


# --- OpenAPI ------------------------------------------------------------------------------


def test_openapi_video_item_is_part_of_the_media_union(client: TestClient) -> None:
    doc = client.get("/openapi.json").json()
    poster = doc["paths"]["/api/media/{media_id}/poster"]["get"]["responses"]
    assert "image/jpeg" in poster["200"]["content"]
    assert "404" in poster

    schemas = doc["components"]["schemas"]
    assert schemas["MediaItem"]["discriminator"]["mapping"]["video"] == (
        "#/components/schemas/VideoItem"
    )
    assert schemas["VideoItem"]["properties"]["kind"]["const"] == "video"
    assert {"kind", "duration", "width", "height", "codec", "posterUrl"} <= set(
        schemas["VideoItem"]["required"]
    )
    codes = schemas["MediaUploadFailure"]["properties"]["errorCode"]["description"]
    for code in ("media.videoTooLong", "media.noVideoStream"):
        assert code in codes
