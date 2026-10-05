"""Music in the export (TASK-RENDER-006, add-music-track design.md D6).

The mixdown runs with the FFmpeg of the pixi environment on short sine tones
generated at test time (no binary test data). Levels are measured with
FFmpeg's `astats`, durations with ffprobe. The end-to-end tests (GL, marked
`slow`) export a small project through the API and inspect the MP4.
"""

import io
import json
import math
import re
import stat
import subprocess
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from conftest import requires_gl
from fastapi.testclient import TestClient
from PIL import Image

from mmy_backend.config import Settings
from mmy_backend.ffmpeg import ffmpeg_binary, ffprobe_binary
from mmy_backend.main import create_app
from mmy_backend.render.audio import AudioSegment
from mmy_backend.render.encode import ExportCancelled, ExportFailed, silent_audio_input
from mmy_backend.render.mixdown import (
    MIX_FILENAME,
    AudioMix,
    audio_filter_graph,
    build_mix_command,
    file_audio_input,
    mix_audio,
)
from mmy_backend.render.music import MusicClipInput, music_schedule

slow = pytest.mark.slow
TIMEOUT = 120.0
AMPLITUDE = 0.5
"""Sine amplitude of the generated originals (RMS ≈ -9 dBFS before encoding)."""
UPMIX_DB = 20 * math.log10(1 / math.sqrt(2))
"""FFmpeg's mono → stereo upmix puts the centre at -3.01 dB on each side (as
for `preview.m4a`, so preview and export agree)."""


# --- Helpers ---------------------------------------------------------------------------


def _ffmpeg() -> str:
    binary = ffmpeg_binary()
    assert binary is not None, "FFmpeg is part of the pixi environment"
    return binary


def _sine(path: Path, seconds: float, rate: int = 44100, channels: int = 1) -> Path:
    """Sine tone (440 Hz, amplitude 0.5); the codec follows the file extension."""
    path.parent.mkdir(parents=True, exist_ok=True)
    expr = f"{AMPLITUDE}*sin(2*PI*440*t)"
    subprocess.run(
        [
            _ffmpeg(),
            *("-v", "error", "-y", "-f", "lavfi"),
            "-i",
            f"aevalsrc={expr}:s={rate}:d={seconds}",
            *("-ac", str(channels)),
            str(path),
        ],
        check=True,
        capture_output=True,
    )
    return path


def _audio_duration(path: Path) -> float:
    binary = ffprobe_binary()
    assert binary is not None
    out = subprocess.run(
        [binary, "-v", "error", "-show_streams", "-of", "json", str(path)],
        capture_output=True,
        check=True,
    ).stdout
    streams = [s for s in json.loads(out)["streams"] if s["codec_type"] == "audio"]
    assert len(streams) == 1
    return float(streams[0]["duration"])


def _streams(path: Path) -> list[dict[str, Any]]:
    binary = ffprobe_binary()
    assert binary is not None
    out = subprocess.run(
        [binary, "-v", "error", "-show_streams", "-of", "json", str(path)],
        capture_output=True,
        check=True,
    ).stdout
    streams: list[dict[str, Any]] = json.loads(out)["streams"]
    return streams


_RMS_RE = re.compile(r"RMS level dB:\s*(\S+)")


def _rms_db(path: Path, start: float, end: float) -> float:
    """Overall RMS level (dBFS) of the audio in [start, end) via `astats`; -inf if silent."""
    result = subprocess.run(
        [
            _ffmpeg(),
            *("-hide_banner", "-nostats", "-i", str(path), "-map", "0:a:0"),
            "-af",
            f"atrim=start={start}:end={end},astats=measure_perchannel=none:measure_overall=RMS_level",
            *("-f", "null", "-"),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    matches = _RMS_RE.findall(result.stderr)
    assert matches, result.stderr
    value = matches[-1]
    return -math.inf if value in ("-inf", "inf") else float(value)


def _clip(media_id: str = "a", **changes: Any) -> MusicClipInput:
    values: dict[str, Any] = {
        "id": "m1",
        "media_id": media_id,
        "trim_start": 0.0,
        "trim_end": None,
        "volume": 1.0,
        "fade_in": False,
        "fade_out": False,
    }
    values.update(changes)
    return MusicClipInput(**values)


def _mix(
    tmp_path: Path,
    clips: list[MusicClipInput],
    sources: dict[str, Path],
    durations: dict[str, float],
    movie: float,
    name: str = "music.wav",
) -> Path:
    segments = music_schedule(clips, durations, movie)
    return mix_audio(
        AudioMix(music_and_narration=segments), sources, movie, tmp_path / "out" / name
    )


@pytest.fixture(scope="module")
def originals(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Path]:
    base = tmp_path_factory.mktemp("originals")
    return {
        # 30 s mono MP3 at 44.1 kHz, 4 s stereo WAV at 48 kHz (formats differ on purpose).
        "long": _sine(base / "long.mp3", 30.0),
        "short": _sine(base / "short.wav", 4.0, rate=48000, channels=2),
    }


DURATIONS = {"long": 30.0, "short": 4.0}


def _reference_db(original: Path, channels: int) -> float:
    """Level a 100 % mix of `original` must have: its own level, upmixed to stereo."""
    return _rms_db(original, 1.0, 3.0) + (UPMIX_DB if channels == 1 else 0.0)


@pytest.fixture(scope="module")
def levels(originals: dict[str, Path]) -> dict[str, float]:
    return {
        "long": _reference_db(originals["long"], 1),
        "short": _reference_db(originals["short"], 2),
    }


# --- Filter graph ------------------------------------------------------------------------


def test_filter_graph_places_each_segment_on_whole_samples() -> None:
    segments = (
        AudioSegment("a", at=0.0, source_in=2.0, length=3.0, gain=0.5, fade_in=1.0, fade_out=0.0),
        AudioSegment("b", at=3.0, source_in=0.0, length=9.5, gain=1.0, fade_in=0.0, fade_out=1.0),
    )
    graph = audio_filter_graph(AudioMix(music_and_narration=segments), 12.5)
    first, second, side, mix = graph.split(";")
    assert first == (
        "[0:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
        "atrim=start_sample=96000:end_sample=240000,asetpts=PTS-STARTPTS,volume=0.5,"
        "afade=t=in:st=0:d=1,adelay=delays=0S:all=1[m0]"
    )
    assert "atrim=start_sample=0:end_sample=456000" in second
    assert "afade=t=out:st=8.5:d=1" in second
    assert second.endswith("adelay=delays=144000S:all=1[m1]")
    assert "afade=t=in" not in second
    # One audible side: it mixes and takes the level gain, and the final amix is
    # skipped - exactly the graph a music-only project produced before.
    assert side == "[m0][m1]amix=inputs=2:normalize=0:duration=longest,volume=1[t0]"
    assert mix == "[t0]apad=whole_len=600000,atrim=end_sample=600000[out]"


def test_mix_command_reads_one_input_per_segment(tmp_path: Path) -> None:
    segments = (
        AudioSegment("a", 0.0, 0.0, 1.0, 1.0, 0.0, 0.0),
        AudioSegment("a", 1.0, 0.0, 1.0, 1.0, 0.0, 1.0),
    )
    sources = {"a": tmp_path / "original.mp3"}
    cmd = build_mix_command(
        "ffmpeg", AudioMix(music_and_narration=segments), sources, 2.0, tmp_path / "music.wav"
    )
    assert cmd.count("-i") == 2
    assert cmd[cmd.index("-c:a") + 1] == "pcm_f32le"
    assert cmd[-1] == str(tmp_path / "music.wav")


def test_file_audio_input_limits_to_the_video_duration(tmp_path: Path) -> None:
    args = file_audio_input(tmp_path / "music.wav")(12.5)
    assert args == ["-t", "12.500000", "-i", str(tmp_path / "music.wav")]


def test_empty_schedule_has_no_graph() -> None:
    with pytest.raises(ValueError):
        audio_filter_graph(AudioMix(), 1.0)


# --- Mixdown with FFmpeg -----------------------------------------------------------------


def test_mix_is_exactly_as_long_as_the_movie_when_the_music_is_longer(
    tmp_path: Path, originals: dict[str, Path]
) -> None:
    out = _mix(tmp_path, [_clip("long")], originals, DURATIONS, 12.5)
    [stream] = _streams(out)
    assert stream["sample_rate"] == "48000"
    assert stream["channels"] == 2
    assert int(stream["duration_ts"]) == 12.5 * 48000


def test_mix_is_audible(
    tmp_path: Path, originals: dict[str, Path], levels: dict[str, float]
) -> None:
    out = _mix(tmp_path, [_clip("long")], originals, DURATIONS, 12.5)
    assert levels["long"] > -20.0
    assert _rms_db(out, 1.0, 10.0) == pytest.approx(levels["long"], abs=0.2)


def test_last_second_fades_out(
    tmp_path: Path, originals: dict[str, Path], levels: dict[str, float]
) -> None:
    out = _mix(tmp_path, [_clip("long")], originals, DURATIONS, 12.5)
    before = _rms_db(out, 11.0, 11.5)
    middle = _rms_db(out, 11.95, 12.05)  # gain ≈ 0.5 → about -6 dB
    last = _rms_db(out, 12.4, 12.5)  # gain 0.1 → 0, RMS factor ≈ 0.058 → about -25 dB
    assert before == pytest.approx(levels["long"], abs=0.2)
    assert middle == pytest.approx(before - 6.0, abs=1.0)
    assert last < before - 20.0


def test_fade_in_rises_from_silence(
    tmp_path: Path, originals: dict[str, Path], levels: dict[str, float]
) -> None:
    full = levels["long"]
    out = _mix(tmp_path, [_clip("long", fade_in=True)], originals, DURATIONS, 5.0)
    assert _rms_db(out, 0.0, 0.1) < full - 20.0
    assert _rms_db(out, 0.45, 0.55) == pytest.approx(full - 6.0, abs=1.0)
    assert _rms_db(out, 1.5, 3.0) == pytest.approx(full, abs=0.2)


def test_volume_50_percent_is_6_db_quieter(tmp_path: Path, originals: dict[str, Path]) -> None:
    full = _mix(tmp_path, [_clip("long")], originals, DURATIONS, 6.0, "full.wav")
    half = _mix(tmp_path, [_clip("long", volume=0.5)], originals, DURATIONS, 6.0, "half.wav")
    difference = _rms_db(half, 1.0, 4.0) - _rms_db(full, 1.0, 4.0)
    assert difference == pytest.approx(20 * math.log10(0.5), abs=0.1)  # -6.02 dB


def test_shorter_music_is_followed_by_silence(
    tmp_path: Path, originals: dict[str, Path], levels: dict[str, float]
) -> None:
    out = _mix(tmp_path, [_clip("short")], originals, DURATIONS, 7.0)
    assert int(_streams(out)[0]["duration_ts"]) == 7 * 48000
    assert _rms_db(out, 1.0, 3.0) == pytest.approx(levels["short"], abs=0.2)
    assert _rms_db(out, 4.1, 7.0) == -math.inf


def test_clips_play_one_after_the_other_with_trim(
    tmp_path: Path, originals: dict[str, Path], levels: dict[str, float]
) -> None:
    clips = [
        _clip("short", id="m1", trim_start=1.0, trim_end=3.0, volume=0.5),
        _clip("long", id="m2", trim_start=10.0),
    ]
    out = _mix(tmp_path, clips, originals, DURATIONS, 6.0)
    assert int(_streams(out)[0]["duration_ts"]) == 6 * 48000
    assert _rms_db(out, 0.2, 1.8) == pytest.approx(levels["short"] - 6.02, abs=0.2)
    assert _rms_db(out, 2.2, 4.8) == pytest.approx(levels["long"], abs=0.2)


# --- Cancel and errors -------------------------------------------------------------------


def _fake_ffmpeg(tmp_path: Path, body: str, monkeypatch: pytest.MonkeyPatch) -> None:
    script = tmp_path / "fake-ffmpeg"
    script.write_text(f"#!/bin/sh\n{body}\n")
    script.chmod(script.stat().st_mode | stat.S_IXUSR)
    monkeypatch.setenv("MMY_FFMPEG", str(script))


SEGMENT = (AudioSegment("long", 0.0, 0.0, 2.0, 1.0, 0.0, 1.0),)


def test_cancel_while_mixing_stops_ffmpeg(
    tmp_path: Path, originals: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    out = tmp_path / "music.wav"
    # Stands in for a long mix: writes a partial file, then hangs.
    _fake_ffmpeg(tmp_path, f"echo partial > '{out}'\nexec sleep 60", monkeypatch)
    cancel = threading.Event()
    timer = threading.Timer(0.3, cancel.set)
    timer.start()
    started = time.monotonic()
    with pytest.raises(ExportCancelled):
        mix_audio(AudioMix(music_and_narration=SEGMENT), originals, 2.0, out, cancel=cancel)
    timer.cancel()
    assert time.monotonic() - started < 5.0
    assert not out.exists()


def test_cancel_before_mixing_finishes(tmp_path: Path, originals: dict[str, Path]) -> None:
    cancel = threading.Event()
    cancel.set()
    out = tmp_path / "music.wav"
    with pytest.raises(ExportCancelled):
        mix_audio(AudioMix(music_and_narration=SEGMENT), originals, 2.0, out, cancel=cancel)
    assert not out.exists()


def test_ffmpeg_error_is_audio_failed(
    tmp_path: Path, originals: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    out = tmp_path / "music.wav"
    _fake_ffmpeg(tmp_path, f"echo partial > '{out}'\necho 'boom' >&2\nexit 3", monkeypatch)
    with pytest.raises(ExportFailed) as info:
        mix_audio(AudioMix(music_and_narration=SEGMENT), originals, 2.0, out)
    assert info.value.code == "export.audioFailed"
    assert info.value.params == {"reason": "FFmpeg exit code 3"}
    assert "boom" in info.value.stderr_tail
    assert not out.exists()


def test_damaged_original_is_audio_failed(tmp_path: Path) -> None:
    broken = tmp_path / "original.mp3"
    broken.write_bytes(b"not audio at all" * 100)
    out = tmp_path / "music.wav"
    with pytest.raises(ExportFailed) as info:
        mix_audio(AudioMix(music_and_narration=SEGMENT), {"long": broken}, 2.0, out)
    assert info.value.code == "export.audioFailed"
    assert not out.exists()


def test_missing_original_is_audio_failed(tmp_path: Path) -> None:
    out = tmp_path / "music.wav"
    with pytest.raises(ExportFailed) as info:
        mix_audio(AudioMix(music_and_narration=SEGMENT), {"long": tmp_path / "gone.mp3"}, 2.0, out)
    assert info.value.code == "export.audioFailed"
    with pytest.raises(ExportFailed) as info:
        mix_audio(AudioMix(music_and_narration=SEGMENT), {}, 2.0, out)
    assert info.value.code == "export.audioFailed"
    assert not out.exists()


# --- Export jobs (API) -------------------------------------------------------------------


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def _png(shade: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (shade, 40, 120)).save(buf, "PNG")
    return buf.getvalue()


def _upload(client: TestClient, files: list[tuple[str, bytes]]) -> list[str]:
    res = client.post(
        "/api/media",
        files=[("files", (name, data, "application/octet-stream")) for name, data in files],
    )
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    assert all("item" in r for r in items), items
    return [r["item"]["id"] for r in items]


def _music_project(
    client: TestClient, tmp_path: Path, *, music: bool = True, volume: float = 1.0
) -> tuple[list[str], str]:
    """Two images of 1 s (fade 0.5 s → 1.5 s movie) and optionally a 30 s music clip."""
    sine = _sine(tmp_path / "upload" / "tune.mp3", 30.0)
    images = _upload(client, [("a.png", _png(20)), ("b.png", _png(200))])
    [audio] = _upload(client, [("tune.mp3", sine.read_bytes())])
    slides = [
        {
            "kind": "image",
            "id": f"s{i}",
            "mediaId": media_id,
            "duration": 1.0,
            "effectId": None,
            "title": None,
            "transitionIn": None if i == 0 else {"transitionId": "fade", "duration": 0.5},
        }
        for i, media_id in enumerate(images)
    ]
    clips = [
        {
            "id": "m1",
            "mediaId": audio,
            "trimStart": 0,
            "trimEnd": None,
            "volume": volume,
            "fadeIn": False,
            "fadeOut": False,
        }
    ]
    project = {
        "schemaVersion": 6,
        "slides": slides,
        "music": clips if music else [],
        "narration": [],
        "clipAudioBalance": 50,
    }
    res = client.put("/api/project", json=project)
    assert res.status_code == 200, res.text
    return images, audio


def _start(client: TestClient) -> str:
    res = client.post("/api/exports", json={"profile": "small", "fileName": "Movie"})
    assert res.status_code == 202, res.text
    return str(res.json()["id"])


def _wait_final(client: TestClient, export_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + TIMEOUT
    while time.monotonic() < deadline:
        job: dict[str, Any] = client.get(f"/api/exports/{export_id}").json()
        if job["status"] in ("done", "failed", "cancelled"):
            return job
        time.sleep(0.02)
    raise AssertionError(f"export {export_id} did not finish")


class RecordingExport:
    """Replaces `export_movie` without GL; records the audio input it was given."""

    def __init__(self) -> None:
        self.audio_args: list[str] = []
        self.mix_duration: float | None = None

    def __call__(self, *args: Any, **kwargs: Any) -> Path:
        output: Path = args[3]
        self.audio_args = kwargs["audio_input"](1.5)
        if "-i" in self.audio_args:
            source = Path(self.audio_args[self.audio_args.index("-i") + 1])
            if source.is_file():
                self.mix_duration = _audio_duration(source)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(b"fake mp4")
        return output


@pytest.fixture
def recording(monkeypatch: pytest.MonkeyPatch) -> RecordingExport:
    fake = RecordingExport()
    monkeypatch.setattr("mmy_backend.exports.export_movie", fake)
    return fake


def test_export_passes_the_mix_as_audio_input(
    client: TestClient, settings: Settings, tmp_path: Path, recording: RecordingExport
) -> None:
    _music_project(client, tmp_path)
    export_id = _start(client)
    job = _wait_final(client, export_id)
    assert job["status"] == "done", job
    assert recording.audio_args[:2] == ["-t", "1.500000"]
    mix = Path(recording.audio_args[-1])
    assert mix.name == MIX_FILENAME
    assert mix.parent == settings.data_dir / "exports" / export_id
    assert recording.mix_duration == pytest.approx(1.5, abs=1e-6)
    assert not mix.exists(), "music.wav is removed after the export"


def test_export_without_music_keeps_the_silent_track(
    client: TestClient, tmp_path: Path, recording: RecordingExport
) -> None:
    _music_project(client, tmp_path, music=False)
    job = _wait_final(client, _start(client))
    assert job["status"] == "done", job
    assert recording.audio_args == silent_audio_input(1.5)


def test_failed_mix_fails_the_export_without_leftovers(
    client: TestClient, settings: Settings, tmp_path: Path, recording: RecordingExport
) -> None:
    _, audio = _music_project(client, tmp_path)
    [original] = (settings.data_dir / "media" / audio).glob("original.*")
    original.write_bytes(b"damaged" * 100)
    export_id = _start(client)
    job = _wait_final(client, export_id)
    assert job["status"] == "failed", job
    assert job["errorCode"] == "export.audioFailed"
    assert job["message"].startswith("The music could not be mixed: ")
    assert recording.audio_args == [], "the video is not rendered"
    assert not (settings.data_dir / "exports" / export_id).exists()


def test_cancel_while_mixing(
    client: TestClient,
    settings: Settings,
    tmp_path: Path,
    recording: RecordingExport,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _music_project(client, tmp_path)
    started = tmp_path / "started"
    _fake_ffmpeg(tmp_path, f"touch '{started}'\nexec sleep 60", monkeypatch)
    export_id = _start(client)
    deadline = time.monotonic() + TIMEOUT
    while not started.exists():
        assert time.monotonic() < deadline, "mixing never started"
        time.sleep(0.02)
    started_cancel = time.monotonic()
    res = client.delete(f"/api/exports/{export_id}")
    assert res.status_code == 204, res.text
    assert time.monotonic() - started_cancel < 10.0, "FFmpeg was stopped, not waited for"
    assert client.get(f"/api/exports/{export_id}").json()["status"] == "cancelled"
    assert recording.audio_args == []
    assert not (settings.data_dir / "exports" / export_id).exists()


def test_music_with_missing_media_is_rejected(client: TestClient, tmp_path: Path) -> None:
    _, audio = _music_project(client, tmp_path)
    # A medium disappears behind the project's back (e.g. the file index changed).
    store = client.app.state.media  # type: ignore[attr-defined]
    store._items = [item for item in store._items if item.id != audio]
    res = client.post("/api/exports", json={"fileName": "Movie"})
    assert res.status_code == 422
    assert res.json()["detail"] == {
        "code": "export.missingMusicMedia",
        "params": {"count": 1, "clips": "1", "mediaIds": audio},
        "message": "Cannot export: media missing for music clip(s) 1.",
    }
    assert client.get("/api/exports").json() == {"items": []}


# --- End to end (GL) ---------------------------------------------------------------------


def _export_mp4(client: TestClient, settings: Settings) -> Path:
    export_id = _start(client)
    job = _wait_final(client, export_id)
    assert job["status"] == "done", job
    out = settings.data_dir / "exports" / export_id / "out.mp4"
    assert out.is_file()
    assert sorted(p.name for p in out.parent.iterdir()) == ["out.mp4"]
    return out


def _video_and_audio(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    streams = _streams(path)
    [video] = [s for s in streams if s["codec_type"] == "video"]
    [audio] = [s for s in streams if s["codec_type"] == "audio"]
    return video, audio


@requires_gl
@slow
def test_exported_movie_carries_the_music(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    _music_project(client, tmp_path)
    full = _reference_db(tmp_path / "upload" / "tune.mp3", 1)
    out = _export_mp4(client, settings)
    video, audio = _video_and_audio(out)
    assert audio["codec_name"] == "aac"
    assert audio["sample_rate"] == "48000"
    assert audio["channels"] == 2
    assert float(video["duration"]) == pytest.approx(1.5, abs=1e-3)
    assert abs(float(audio["duration"]) - float(video["duration"])) <= 1 / 30
    assert full > -20.0
    assert _rms_db(out, 0.1, 0.4) == pytest.approx(full, abs=0.5)
    # The last second fades: 0.5 → 1.5 s, gain 1 → 0.
    assert _rms_db(out, 0.95, 1.05) == pytest.approx(full - 6.0, abs=1.0)
    assert _rms_db(out, 1.4, 1.5) < full - 15.0


@requires_gl
@slow
def test_exported_movie_at_half_volume(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    _music_project(client, tmp_path, volume=0.5)
    full = _reference_db(tmp_path / "upload" / "tune.mp3", 1)
    out = _export_mp4(client, settings)
    assert _rms_db(out, 0.1, 0.4) == pytest.approx(full - 6.02, abs=0.5)


@requires_gl
@slow
def test_exported_movie_without_music_is_silent(
    client: TestClient, settings: Settings, tmp_path: Path
) -> None:
    _music_project(client, tmp_path, music=False)
    out = _export_mp4(client, settings)
    video, audio = _video_and_audio(out)
    assert abs(float(audio["duration"]) - float(video["duration"])) <= 1 / 30
    assert _rms_db(out, 0.0, 1.5) == -math.inf
