"""Video import: detection, limits and data model (TASK-API-016, design.md D1, D2).

The video fixtures are generated with the FFmpeg of the pixi environment at
test time (tiny lavfi test patterns), so no binary test data is committed.
"""

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

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
    assert sorted(p.name for p in item_dir.iterdir()) == [f"original.{stored_ext}"]
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


# --- OpenAPI ------------------------------------------------------------------------------


def test_openapi_video_item_is_part_of_the_media_union(client: TestClient) -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
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
