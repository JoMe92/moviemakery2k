"""Audio import: detection, limits, metadata, legacy index and derivatives.

TASK-API-012 (design.md D1) and TASK-API-013 (design.md D2).

The audio fixtures are generated with the FFmpeg of the pixi environment at
test time (short sine tones), so no binary test data is committed.
"""

import dataclasses
import io
import json
import math
import subprocess
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from mmy_backend import media
from mmy_backend.config import Settings
from mmy_backend.ffmpeg import ffmpeg_binary, ffprobe_binary
from mmy_backend.main import create_app
from mmy_backend.media import AudioItem, ImageItem, MediaStore

# name -> (file extension, ffmpeg encoder, extra output args, codec reported by ffprobe)
FORMATS: dict[str, tuple[str, str, list[str], str]] = {
    "mp3": ("mp3", "libmp3lame", [], "mp3"),
    "wav": ("wav", "pcm_s16le", [], "pcm_s16le"),
    "m4a": ("m4a", "aac", [], "aac"),
    "ogg-vorbis": ("ogg", "libvorbis", [], "vorbis"),
    "ogg-opus": ("ogg", "libopus", [], "opus"),
    "flac": ("flac", "flac", [], "flac"),
    # An audio-only WebM: what MediaRecorder produces for a narration recording
    # (add-narration-and-audio-levels design.md D3).
    "webm-opus": ("webm", "libopus", [], "opus"),
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


def _sine(
    tmp_path: Path,
    fmt: str,
    seconds: float = 1.0,
    rate: int = 44100,
    channels: int = 1,
) -> bytes:
    ext, encoder, extra, _ = FORMATS[fmt]
    source = f"sine=frequency=440:duration={seconds}:sample_rate={rate}"
    return _run_ffmpeg(
        tmp_path,
        f"{fmt}-{seconds}-{rate}-{channels}.{ext}",
        ["-f", "lavfi", "-i", source, "-ac", str(channels), "-c:a", encoder, *extra],
    )


def _video_only_mp4(tmp_path: Path) -> bytes:
    return _run_ffmpeg(
        tmp_path,
        "video-only.mp4",
        [
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=1:size=64x48:rate=10",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
        ],
    )


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (16, 12), (10, 20, 30)).save(buf, "JPEG")
    return buf.getvalue()


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


# --- Import per format ---------------------------------------------------------------


@pytest.mark.parametrize("fmt", list(FORMATS))
def test_audio_is_imported_with_metadata_and_original(
    fmt: str, client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    ext, _, _, codec = FORMATS[fmt]
    data = _sine(tmp_path, fmt, seconds=2.0, rate=44100, channels=2)
    [result] = _upload(client, [(f"song.{ext}", data)])

    assert result["ok"] is True, result
    item = result["item"]
    media_id = item["id"]
    assert set(item) == {
        "id",
        "kind",
        "filename",
        "duration",
        "sampleRate",
        "channels",
        "codec",
        "createdAt",
        "audioUrl",
        "peaksUrl",
    }
    assert item["kind"] == "audio"
    assert item["filename"] == f"song.{ext}"
    assert item["duration"] == pytest.approx(2.0, abs=0.1)
    # Opus always decodes at 48 kHz.
    assert item["sampleRate"] == (48000 if codec == "opus" else 44100)
    assert item["channels"] == 2
    assert item["codec"] == codec
    assert item["audioUrl"] == f"/api/media/{media_id}/audio"
    assert item["peaksUrl"] == f"/api/media/{media_id}/peaks"

    # The original is stored unchanged under a name derived from its content.
    item_dir = settings.data_dir / "media" / media_id
    assert sorted(p.name for p in item_dir.iterdir()) == sorted(
        [f"original.{ext}", "peaks.json", "preview.m4a"]
    )
    assert (item_dir / f"original.{ext}").read_bytes() == data

    index = json.loads((settings.data_dir / "media.json").read_text(encoding="utf-8"))
    assert index[0]["kind"] == "audio"
    [stored] = MediaStore(settings.data_dir).list()
    assert isinstance(stored, AudioItem)
    assert stored.codec == codec

    listed = client.get("/api/media").json()["items"]
    assert listed == [item]


def test_mono_wav_44100_reports_rate_and_channels(client: TestClient, tmp_path: Path) -> None:
    data = _sine(tmp_path, "wav", seconds=1.0, rate=44100, channels=1)
    [result] = _upload(client, [("mono.wav", data)])
    assert result["ok"] is True
    assert (result["item"]["sampleRate"], result["item"]["channels"]) == (44100, 1)


def test_detection_ignores_the_file_name(client: TestClient, tmp_path: Path) -> None:
    flac = _sine(tmp_path, "flac")
    [as_jpg, as_txt] = _upload(client, [("cover.jpg", flac), ("notes.txt", flac)])
    assert as_jpg["ok"] and as_txt["ok"]
    assert as_jpg["item"]["codec"] == as_txt["item"]["codec"] == "flac"


def test_mixed_import_sorts_by_kind(client: TestClient, tmp_path: Path) -> None:
    items = _upload(
        client,
        [("a.jpg", _jpeg()), ("b.flac", _sine(tmp_path, "flac")), ("c.jpg", _jpeg())],
    )
    assert [r["item"]["kind"] for r in items] == ["image", "audio", "image"]


# --- Limits -----------------------------------------------------------------------------


def test_default_audio_limits() -> None:
    assert media.MAX_AUDIO_BYTES == 100 * 1024 * 1024
    assert media.MAX_AUDIO_SECONDS == 15 * 60
    assert media.MAX_IMAGE_BYTES == 25 * 1024 * 1024


@pytest.mark.parametrize("fmt", list(FORMATS))
def test_too_long_audio_is_rejected_and_nothing_stored(
    fmt: str,
    client: TestClient,
    settings: Settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # One minute as limit instead of 15, so the fixture stays small.
    monkeypatch.setattr(media, "MAX_AUDIO_SECONDS", 60)
    ext = FORMATS[fmt][0]
    long_file = _sine(tmp_path, fmt, seconds=61.0, rate=8000)
    fits = _sine(tmp_path, fmt, seconds=59.0, rate=8000)

    items = _upload(client, [(f"long.{ext}", long_file), (f"fits.{ext}", fits)])

    assert items[0] == {
        "filename": f"long.{ext}",
        "ok": False,
        "errorCode": "media.audioTooLong",
        "errorParams": {"maxMinutes": 1},
        "message": "The audio file is too long (at most 1 minutes).",
    }
    assert items[1]["ok"] is True
    stored = {p.relative_to(settings.data_dir).parts[:2] for p in _files_under(settings.data_dir)}
    assert stored == {("media.json",), ("media", items[1]["item"]["id"])}


def test_audio_over_size_limit_is_too_large(
    client: TestClient, settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(media, "MAX_AUDIO_BYTES", 64 * 1024)
    data = _sine(tmp_path, "wav", seconds=1.0, rate=44100)  # ~88 KB
    assert len(data) > media.MAX_AUDIO_BYTES
    [result] = _upload(client, [("big.wav", data)])
    assert result["errorCode"] == "media.tooLarge"
    assert result["errorParams"] == {"maxMegabytes": 0}
    assert _files_under(settings.data_dir) == set()


def test_image_between_image_and_audio_limit_is_too_large_as_image(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(media, "MAX_IMAGE_BYTES", 1024)
    big = _jpeg() + b"\0" * 2048
    [result] = _upload(client, [("big.jpg", big)])
    assert result["errorCode"] == "media.tooLarge"
    assert result["errorParams"] == {"maxMegabytes": 0}  # the image limit, not the audio one


# --- Content checks ---------------------------------------------------------------------


def test_video_without_audio_named_m4a_is_imported_as_video(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    """A video stream wins regardless of the file name or a missing audio track

    (add-video-import D1, media-library spec scenario "Video statt Audio")."""
    [result] = _upload(client, [("clip.m4a", _video_only_mp4(tmp_path))])
    assert result["ok"] is True, result
    item = result["item"]
    assert item["kind"] == "video"
    assert item["filename"] == "clip.m4a"
    assert item["codec"] == "h264"
    assert (item["width"], item["height"]) == (64, 48)
    item_dir = settings.data_dir / "media" / item["id"]
    assert (item_dir / "original.mp4").is_file()


def test_other_audio_container_is_unsupported(client: TestClient, tmp_path: Path) -> None:
    aiff = _run_ffmpeg(
        tmp_path, "tone.aiff", ["-f", "lavfi", "-i", "sine=duration=1", "-c:a", "pcm_s16be"]
    )
    [result] = _upload(client, [("tone.aiff", aiff)])
    assert result["errorCode"] == "media.unsupportedType"


def test_missing_ffprobe_reports_probe_unavailable_but_images_import(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(media, "ffprobe_binary", lambda: None)
    items = _upload(client, [("a.mp3", _sine(tmp_path, "mp3")), ("b.jpg", _jpeg())])
    assert items[0] == {
        "filename": "a.mp3",
        "ok": False,
        "errorCode": "media.probeUnavailable",
        "errorParams": {},
        "message": "Audio files cannot be checked: ffprobe was not found or could not be started.",
    }
    assert items[1]["ok"] is True


def test_ffprobe_that_cannot_start_reports_probe_unavailable(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MMY_FFPROBE", str(tmp_path / "no-such-ffprobe"))
    [result] = _upload(client, [("a.wav", _sine(tmp_path, "wav"))])
    assert result["errorCode"] == "media.probeUnavailable"


# --- Index ------------------------------------------------------------------------------


def _legacy_entry(media_id: str, name: str) -> dict[str, Any]:
    return {
        "id": media_id,
        "filename": name,
        "width": 40,
        "height": 30,
        "createdAt": "2026-01-02T10:00:00Z",
        "thumbnailUrl": f"/api/media/{media_id}/thumbnail",
        "previewUrl": f"/api/media/{media_id}/preview",
    }


def test_legacy_index_without_kind_loads_as_images(settings: Settings, tmp_path: Path) -> None:
    legacy = [_legacy_entry("a" * 32, "old-1.jpg"), _legacy_entry("b" * 32, "old-2.png")]
    settings.data_dir.mkdir(parents=True)
    (settings.data_dir / "media.json").write_text(json.dumps(legacy), encoding="utf-8")

    store = MediaStore(settings.data_dir)
    assert all(isinstance(item, ImageItem) for item in store.list())

    with TestClient(create_app(settings)) as client:
        listed = client.get("/api/media").json()["items"]
        assert listed == [{**entry, "kind": "image"} for entry in legacy]
        _upload(client, [("new.ogg", _sine(tmp_path, "ogg-vorbis"))])

    # The next write stores `kind` for every entry.
    index = json.loads((settings.data_dir / "media.json").read_text(encoding="utf-8"))
    assert [entry["kind"] for entry in index] == ["image", "image", "audio"]
    assert [m.kind for m in MediaStore(settings.data_dir).list()] == ["image", "image", "audio"]


def test_openapi_media_item_is_a_union_by_kind(client: TestClient) -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    assert schemas["MediaItem"]["discriminator"] == {
        "propertyName": "kind",
        "mapping": {
            "audio": "#/components/schemas/AudioItem",
            "image": "#/components/schemas/ImageItem",
            "video": "#/components/schemas/VideoItem",
        },
    }
    assert schemas["ImageItem"]["properties"]["kind"]["const"] == "image"
    assert schemas["AudioItem"]["properties"]["kind"]["const"] == "audio"
    assert {"kind", "duration", "sampleRate", "channels", "codec", "audioUrl", "peaksUrl"} <= set(
        schemas["AudioItem"]["required"]
    )
    codes = schemas["MediaUploadFailure"]["properties"]["errorCode"]["description"]
    for code in ("media.audioTooLong", "media.noAudioStream", "media.probeUnavailable"):
        assert code in codes


# --- Derivatives: preview version and peaks (TASK-API-013, D2) ---------------------------


def _ffprobe_stream(path: Path) -> dict[str, Any]:
    binary = ffprobe_binary()
    assert binary is not None
    out = subprocess.run(
        [
            binary,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        check=True,
        capture_output=True,
    ).stdout
    report = json.loads(out)
    [stream] = report["streams"]
    return {**stream, "format_name": report["format"]["format_name"]}


@pytest.mark.parametrize(
    ("fmt", "seconds", "rate", "channels"),
    [
        ("wav", 1.0, 44100, 1),
        ("mp3", 2.0, 44100, 2),
        ("m4a", 1.5, 48000, 2),
        ("ogg-vorbis", 1.0, 22050, 1),
        ("ogg-opus", 1.0, 48000, 2),
        ("flac", 3.0, 96000, 2),
    ],
)
def test_preview_version_and_peaks_are_derived(
    fmt: str,
    seconds: float,
    rate: int,
    channels: int,
    client: TestClient,
    settings: Settings,
    tmp_path: Path,
) -> None:
    ext = FORMATS[fmt][0]
    data = _sine(tmp_path, fmt, seconds=seconds, rate=rate, channels=channels)
    [result] = _upload(client, [(f"tone.{ext}", data)])
    assert result["ok"] is True, result
    item = result["item"]
    item_dir = settings.data_dir / "media" / item["id"]

    # Preview version: AAC in M4A, 48 kHz, stereo - independent of the original.
    stream = _ffprobe_stream(item_dir / "preview.m4a")
    assert stream["codec_type"] == "audio"
    assert stream["codec_name"] == "aac"
    assert "mp4" in stream["format_name"].split(",")
    assert int(stream["sample_rate"]) == 48000
    assert stream["channels"] == 2
    assert float(stream["duration"]) == pytest.approx(seconds, abs=0.1)

    # The medium keeps the metadata of the original, the duration is the decoded one.
    assert (item["sampleRate"], item["channels"]) == (
        48000 if fmt == "ogg-opus" else rate,
        channels,
    )
    assert item["duration"] == pytest.approx(seconds, abs=0.03)

    # Peaks: 50 per second over the decoded duration, 0..1.
    peaks = json.loads((item_dir / "peaks.json").read_text(encoding="utf-8"))
    assert set(peaks) == {"rate", "peaks"}
    assert peaks["rate"] == 50
    assert len(peaks["peaks"]) == math.ceil(item["duration"] * 50 - 1e-9)
    assert abs(len(peaks["peaks"]) - seconds * 50) <= 2
    assert all(0 <= p <= 1 for p in peaks["peaks"])
    # FFmpeg's sine source has amplitude 1/8; lossy codecs vary slightly.
    middle = peaks["peaks"][5:-5]
    assert middle and all(0.08 < p < 0.2 for p in middle)


def test_decoded_duration_replaces_the_estimate(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    real_probe = media.probe_audio

    def lying_probe(path: Path) -> media.AudioProbe:
        return dataclasses.replace(real_probe(path), duration=42.0)

    monkeypatch.setattr(media, "probe_audio", lying_probe)
    [result] = _upload(client, [("tone.wav", _sine(tmp_path, "wav", seconds=2.0))])
    assert result["item"]["duration"] == pytest.approx(2.0, abs=0.001)


def test_decoded_length_over_the_limit_is_too_long(
    client: TestClient,
    settings: Settings,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The container claims 30 s, but 61 s decode; the limit is one minute.
    monkeypatch.setattr(media, "MAX_AUDIO_SECONDS", 60)
    real_probe = media.probe_audio

    def lying_probe(path: Path) -> media.AudioProbe:
        return dataclasses.replace(real_probe(path), duration=30.0)

    monkeypatch.setattr(media, "probe_audio", lying_probe)
    [result] = _upload(client, [("long.wav", _sine(tmp_path, "wav", seconds=61.0, rate=8000))])
    assert result["errorCode"] == "media.audioTooLong"
    assert result["errorParams"] == {"maxMinutes": 1}
    assert _files_under(settings.data_dir) == set()


def test_missing_ffmpeg_rejects_audio_without_leftovers(
    client: TestClient, settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(media, "ffmpeg_binary", lambda: None)
    [result] = _upload(client, [("a.wav", _sine(tmp_path, "wav"))])
    assert result["errorCode"] == "media.probeUnavailable"
    assert _files_under(settings.data_dir) == set()


def test_undecodable_audio_is_unsupported(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    # A valid FLAC header followed by garbage: ffprobe accepts it, decoding yields nothing.
    flac = _sine(tmp_path, "flac", seconds=1.0)
    broken = flac[:8192] + bytes(range(256)) * 64
    [result] = _upload(client, [("broken.flac", broken)])
    if result["ok"]:
        pytest.skip("this FFmpeg build decodes the truncated stream")
    assert result["errorCode"] == "media.unsupportedType"
    assert _files_under(settings.data_dir) == set()


def test_audio_and_peaks_endpoints_serve_immutable_files(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    [result] = _upload(client, [("tone.mp3", _sine(tmp_path, "mp3"))])
    item = result["item"]
    item_dir = settings.data_dir / "media" / item["id"]

    audio = client.get(item["audioUrl"])
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/mp4"
    assert audio.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert audio.content == (item_dir / "preview.m4a").read_bytes()

    ranged = client.get(item["audioUrl"], headers={"Range": "bytes=0-99"})
    assert ranged.status_code == 206
    assert len(ranged.content) == 100

    peaks = client.get(item["peaksUrl"])
    assert peaks.status_code == 200
    assert peaks.headers["content-type"] == "application/json"
    assert peaks.headers["cache-control"] == "public, max-age=31536000, immutable"
    body = media.AudioPeaks.model_validate(peaks.json())
    assert body.rate == 50
    assert len(body.peaks) == 50


def test_audio_endpoints_are_404_for_images_and_unknown_ids(client: TestClient) -> None:
    [image] = _upload(client, [("a.jpg", _jpeg())])
    image_id = image["item"]["id"]
    for path in ("audio", "peaks"):
        for media_id in (image_id, "f" * 32, "not-an-id"):
            res = client.get(f"/api/media/{media_id}/{path}")
            assert res.status_code == 404, (path, media_id)
            assert res.json()["detail"]["code"] == "media.notFound"


def test_openapi_documents_audio_and_peaks(client: TestClient) -> None:
    doc = client.get("/openapi.json").json()
    audio = doc["paths"]["/api/media/{media_id}/audio"]["get"]["responses"]
    assert "audio/mp4" in audio["200"]["content"]
    assert "404" in audio
    peaks = doc["paths"]["/api/media/{media_id}/peaks"]["get"]["responses"]
    assert peaks["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/AudioPeaks"
    }
    schema = doc["components"]["schemas"]["AudioPeaks"]
    assert set(schema["required"]) == {"rate", "peaks"}
