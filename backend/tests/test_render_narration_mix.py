"""The two-stage export mixdown (TASK-RENDER-009, add-narration-and-audio-levels
design.md D1, D2, D4 and D5).

`test_render_mixdown.py` keeps covering the music track on its own and must stay
green unchanged: a music-only project still produces the same graph and the same
file. What is new here is the second side of the mix — narration at its absolute
`at`, the original sound of the video elements, and the one global level between
the two sides.

The mixdown runs with the FFmpeg of the pixi environment on short sine tones and
a tiny generated video (no binary test data). Levels are measured with FFmpeg's
`astats`.
"""

import json
import math
import re
import subprocess
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from conftest import requires_gl
from fastapi.testclient import TestClient

from mmy_backend.config import Settings
from mmy_backend.ffmpeg import ffmpeg_binary, ffprobe_binary
from mmy_backend.main import create_app
from mmy_backend.render.audio import (
    AudioSegment,
    NarrationClipInput,
    VideoClipAudioInput,
    at_gain,
    audio_balance_gains,
    narration_schedule,
    video_clip_audio_schedule,
)
from mmy_backend.render.encode import silent_audio_input
from mmy_backend.render.mixdown import (
    AudioMix,
    audio_filter_graph,
    has_audio_stream,
    mix_audio,
)
from mmy_backend.render.music import MusicClipInput, music_schedule

AMPLITUDE = 0.5
"""Sine amplitude of the generated originals (RMS ≈ -9 dBFS before encoding)."""
UPMIX_DB = 20 * math.log10(1 / math.sqrt(2))
"""FFmpeg's mono → stereo upmix puts the centre at -3.01 dB on each side."""
SILENT = -60.0
"""Anything below this counts as silence for these measurements."""

slow = pytest.mark.slow
DURATIONS = {"music": 30.0, "voice": 4.0}


# --- Helpers ------------------------------------------------------------------------


def _ffmpeg() -> str:
    binary = ffmpeg_binary()
    assert binary is not None, "FFmpeg is part of the pixi environment"
    return binary


def _run(args: list[str]) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(args, check=True, capture_output=True)


def _sine(path: Path, seconds: float, freq: int = 440, rate: int = 44100) -> Path:
    """Mono sine tone; the codec follows the file extension."""
    path.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            _ffmpeg(),
            *("-v", "error", "-y", "-f", "lavfi"),
            "-i",
            f"aevalsrc={AMPLITUDE}*sin(2*PI*{freq}*t):s={rate}:d={seconds}",
            *("-ac", "1"),
            str(path),
        ]
    )
    return path


def _video(path: Path, seconds: float, *, audio: bool) -> Path:
    """A tiny H.264 clip, with or without an AAC track (design.md D1)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    args = [
        _ffmpeg(),
        *("-v", "error", "-y"),
        *("-f", "lavfi", "-i", f"color=c=blue:s=64x48:r=30:d={seconds}"),
    ]
    if audio:
        args += ["-f", "lavfi", "-i", f"aevalsrc={AMPLITUDE}*sin(2*PI*880*t):s=48000:d={seconds}"]
    args += ["-c:v", "libx264", "-pix_fmt", "yuv420p"]
    if audio:
        args += ["-c:a", "aac", "-ac", "1"]
    args.append(str(path))
    _run(args)
    return path


_RMS_RE = re.compile(r"RMS level dB:\s*(\S+)")


def _rms_db(path: Path, start: float, end: float) -> float:
    """Overall RMS level (dBFS) of the audio in [start, end); -inf if silent."""
    result = subprocess.run(
        [
            _ffmpeg(),
            *("-hide_banner", "-nostats", "-i", str(path), "-map", "0:a:0"),
            "-af",
            f"atrim=start={start}:end={end},"
            "astats=measure_perchannel=none:measure_overall=RMS_level",
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


def _streams(path: Path) -> list[dict[str, Any]]:
    binary = ffprobe_binary()
    assert binary is not None
    out = _run([binary, "-v", "error", "-show_streams", "-of", "json", str(path)]).stdout
    streams: list[dict[str, Any]] = json.loads(out)["streams"]
    return streams


@pytest.fixture(scope="module")
def originals(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Path]:
    base = tmp_path_factory.mktemp("narration-originals")
    return {
        # 440 Hz music, 1000 Hz narration: the two are separable by frequency,
        # so a mix can be measured per source.
        "music": _sine(base / "music.mp3", 30.0),
        "voice": _sine(base / "voice.wav", 4.0, freq=1000, rate=48000),
        # 880 Hz clip sound, and a second clip with no audio track at all.
        "loud": _video(base / "loud.mp4", 6.0, audio=True),
        "mute": _video(base / "mute.mp4", 6.0, audio=False),
    }


@pytest.fixture(scope="module")
def reference(originals: dict[str, Path]) -> dict[str, float]:
    """The level a 100 % mix of each source must reach, upmixed to stereo."""
    return {
        "music": _rms_db(originals["music"], 1.0, 3.0) + UPMIX_DB,
        "voice": _rms_db(originals["voice"], 1.0, 3.0) + UPMIX_DB,
        "clip": _rms_db(originals["loud"], 1.0, 3.0) + UPMIX_DB,
    }


CLIP = VideoClipAudioInput(media_id="loud", at=0.0, trim_in=0.0, trim_out=6.0)


def _music(**changes: Any) -> MusicClipInput:
    values: dict[str, Any] = {
        "id": "m1",
        "media_id": "music",
        "trim_start": 0.0,
        "trim_end": None,
        "volume": 1.0,
        "fade_in": False,
        "fade_out": False,
    }
    values.update(changes)
    return MusicClipInput(**values)


def _narration(**changes: Any) -> NarrationClipInput:
    values: dict[str, Any] = {
        "id": "n1",
        "media_id": "voice",
        "at": 0.0,
        "trim_start": 0.0,
        "trim_end": None,
        "volume": 1.0,
        "fade_in": False,
        "fade_out": False,
    }
    values.update(changes)
    return NarrationClipInput(**values)


def _mix(
    tmp_path: Path,
    *,
    music: list[MusicClipInput] | None = None,
    narration: list[NarrationClipInput] | None = None,
    clips: list[VideoClipAudioInput] | None = None,
    balance: float = 50.0,
    movie: float = 6.0,
    sources: dict[str, Path],
    name: str = "music.wav",
) -> Path:
    """Mixes the given tracks; one side alone measures just that side's gain,
    which is how the level is checked without having to separate two tones that
    sound at the same time."""
    mix = AudioMix(
        music_and_narration=(
            *music_schedule(music or [], DURATIONS, movie),
            *narration_schedule(narration or [], DURATIONS, movie),
        ),
        clip_audio=video_clip_audio_schedule(clips or [], movie),
        balance=balance,
    )
    return mix_audio(mix, sources, movie, tmp_path / "out" / name)


# --- The two sides of the graph -----------------------------------------------------


def _segment(media_id: str, at: float = 0.0, length: float = 2.0) -> AudioSegment:
    return AudioSegment(
        media_id, at=at, source_in=0.0, length=length, gain=1.0, fade_in=0.0, fade_out=0.0
    )


def test_both_sides_mix_separately_before_the_last_amix() -> None:
    """Two-stage as design.md D5 describes it: each side mixes to an
    intermediate signal, takes the level's `volume`, and only then do both run
    together."""
    mix = AudioMix(
        music_and_narration=(_segment("music"), _segment("voice", at=1.0)),
        clip_audio=(_segment("clip"),),
        balance=25.0,
    )
    chains = audio_filter_graph(mix, 4.0).split(";")
    assert len(chains) == 6
    # One chain per segment, in "music and narration, then clip sound" order.
    assert chains[0].startswith("[0:a:0]") and chains[0].endswith("[m0]")
    assert chains[1].startswith("[1:a:0]") and chains[1].endswith("[m1]")
    assert chains[2].startswith("[2:a:0]") and chains[2].endswith("[m2]")
    # Music and narration keep full gain at 25, the clip sound gets half.
    assert chains[3] == "[m0][m1]amix=inputs=2:normalize=0:duration=longest,volume=1[t0]"
    assert chains[4] == "[m2]volume=0.5[t1]"
    assert chains[5] == (
        "[t0][t1]amix=inputs=2:normalize=0:duration=longest,"
        "apad=whole_len=192000,atrim=end_sample=192000[out]"
    )


def test_a_single_segment_side_skips_its_own_amix() -> None:
    mix = AudioMix(music_and_narration=(_segment("music"),), balance=0.0)
    chains = audio_filter_graph(mix, 2.0).split(";")
    assert chains[1] == "[m0]volume=1[t0]"
    assert chains[2] == "[t0]apad=whole_len=96000,atrim=end_sample=96000[out]"


@pytest.mark.parametrize(
    ("balance", "expected"),
    [
        # The level drops a side entirely instead of scheduling it at gain 0.
        (0.0, ["music"]),
        (50.0, ["music", "clip"]),
        (100.0, ["clip"]),
    ],
)
def test_the_level_decides_which_sides_reach_the_graph(balance: float, expected: list[str]) -> None:
    mix = AudioMix(
        music_and_narration=(_segment("music"),), clip_audio=(_segment("clip"),), balance=balance
    )
    assert [s.media_id for s in mix.segments] == expected
    assert len(mix.sides) == len(expected)


def test_a_project_without_any_sound_is_silent() -> None:
    assert AudioMix().is_silent()
    # Everything on the silenced side: still nothing to mix.
    assert AudioMix(music_and_narration=(_segment("music"),), balance=100.0).is_silent()
    assert AudioMix(clip_audio=(_segment("clip"),), balance=0.0).is_silent()


def test_the_level_gains_match_the_preview() -> None:
    """Same formula as `audioBalanceGains` in `apps/web/src/timeline/audio.ts`."""
    assert audio_balance_gains(0) == audio_balance_gains(0.0)
    assert (audio_balance_gains(0).clip, audio_balance_gains(0).music_and_narration) == (0.0, 1.0)
    assert (audio_balance_gains(50).clip, audio_balance_gains(50).music_and_narration) == (1.0, 1.0)
    assert (audio_balance_gains(100).clip, audio_balance_gains(100).music_and_narration) == (
        1.0,
        0.0,
    )
    assert at_gain((_segment("a"),), 0.0) == ()


# --- Mixdown with FFmpeg ------------------------------------------------------------


def test_music_and_narration_are_both_audible_in_the_mix(
    tmp_path: Path, originals: dict[str, Path], reference: dict[str, float]
) -> None:
    """Spec movie-export "Clip-Ton und Erzählung im Export", for the two tracks
    that both go into the first stage: the narration adds to the music where it
    sits instead of replacing it."""
    out = _mix(
        tmp_path,
        music=[_music()],
        narration=[_narration(at=2.0, trim_end=2.0)],
        sources=originals,
        movie=6.0,
    )
    music_only = _rms_db(out, 0.2, 1.8)
    both = _rms_db(out, 2.2, 3.8)
    after = _rms_db(out, 4.2, 4.8)
    assert music_only == pytest.approx(reference["music"], abs=0.5)
    assert after == pytest.approx(reference["music"], abs=0.5)
    # The narration is a second source over the same music: audibly louder.
    assert both > music_only + 1.0


def test_narration_sits_at_its_own_start_time(
    tmp_path: Path, originals: dict[str, Path], reference: dict[str, float]
) -> None:
    """Spec narration-track "Erzählung an fester Stelle": audible only in its own
    window, and nothing about the filmstrip moves it."""
    out = _mix(tmp_path, narration=[_narration(at=3.0, trim_end=2.0)], sources=originals, movie=6.0)
    assert _rms_db(out, 0.2, 2.8) < SILENT
    assert _rms_db(out, 3.2, 4.8) == pytest.approx(reference["voice"], abs=0.5)
    # The last second of the movie carries the end-of-movie fade, so the window
    # stops short of it.
    assert _rms_db(out, 5.2, 5.9) < SILENT


def test_overlapping_narration_clips_are_mixed_not_replaced(
    tmp_path: Path, originals: dict[str, Path], reference: dict[str, float]
) -> None:
    """Spec narration-track "Überlappende Erzählung": in the overlap both are
    heard, so the level is above a single clip's."""
    out = _mix(
        tmp_path,
        narration=[
            _narration(id="n1", at=0.0, trim_end=3.0),
            _narration(id="n2", at=2.0, trim_end=3.0),
        ],
        sources=originals,
        movie=6.0,
    )
    alone = _rms_db(out, 0.2, 1.8)
    together = _rms_db(out, 2.2, 2.9)
    tail = _rms_db(out, 3.2, 4.8)
    assert alone == pytest.approx(reference["voice"], abs=0.5)
    # Two copies of the same tone add up; the exact figure depends on their
    # phase, so only the direction is asserted.
    assert together > alone + 1.0
    # The second clip keeps its full length: neither was cut back.
    assert tail == pytest.approx(reference["voice"], abs=0.5)


def test_clip_audio_and_music_are_about_equally_loud_at_level_50(
    tmp_path: Path, originals: dict[str, Path], reference: dict[str, float]
) -> None:
    """Spec movie-export "Clip-Ton und Erzählung im Export": at `clipAudioBalance`
    50 both sides are in the track, hörbar etwa gleich laut."""
    music_only = _mix(
        tmp_path, music=[_music()], balance=50.0, sources=originals, name="music-side.wav"
    )
    clip_only = _mix(tmp_path, clips=[CLIP], balance=50.0, sources=originals, name="clip-side.wav")
    both = _mix(
        tmp_path, music=[_music()], clips=[CLIP], balance=50.0, sources=originals, name="both.wav"
    )
    music_db = _rms_db(music_only, 0.2, 1.8)
    clip_db = _rms_db(clip_only, 0.2, 1.8)
    assert music_db == pytest.approx(reference["music"], abs=0.5)
    assert clip_db == pytest.approx(reference["clip"], abs=0.5)
    # Neither side is turned down at 50, so the two are within 2 dB of each other.
    assert abs(music_db - clip_db) < 2.0
    # And the combined file really carries both.
    assert _rms_db(both, 0.2, 1.8) > max(music_db, clip_db) + 1.0


@pytest.mark.parametrize(
    ("balance", "music_db", "clip_db"),
    [
        (0, 0.0, None),
        (25, 0.0, -6.02),
        (50, 0.0, 0.0),
        (75, -6.02, 0.0),
        (100, None, 0.0),
    ],
)
def test_the_level_sets_the_ratio_in_the_file(
    tmp_path: Path,
    originals: dict[str, Path],
    reference: dict[str, float],
    balance: int,
    music_db: float | None,
    clip_db: float | None,
) -> None:
    """Spec preview-player and movie-export: the level is the ratio between the
    two sides, and at either end one of them is simply gone. Each side is mixed
    on its own, so what is measured is that side's gain and nothing else.
    """
    music_side = AudioMix(
        music_and_narration=music_schedule([_music()], DURATIONS, 6.0), balance=float(balance)
    )
    clip_side = AudioMix(clip_audio=video_clip_audio_schedule([CLIP], 6.0), balance=float(balance))
    for key, mix, offset in (("music", music_side, music_db), ("clip", clip_side, clip_db)):
        if offset is None:
            # The level silences this side entirely: there is nothing to mix.
            assert mix.is_silent(), (balance, key)
            continue
        out = mix_audio(mix, originals, 6.0, tmp_path / "out" / f"{key}-{balance}.wav")
        assert _rms_db(out, 0.2, 1.8) == pytest.approx(reference[key] + offset, abs=0.6), (
            balance,
            key,
        )


def test_a_video_without_an_audio_track_yields_no_clip_sound(
    originals: dict[str, Path],
) -> None:
    """design.md D1: such an element contributes no source, so the mix must not
    even try to read `[k:a:0]` from it."""
    assert has_audio_stream(originals["loud"]) is True
    assert has_audio_stream(originals["mute"]) is False
    # A project whose only sound would have come from that video is silent.
    assert AudioMix(clip_audio=(), balance=100.0).is_silent()


def test_probing_a_file_that_is_not_media_counts_as_no_audio(tmp_path: Path) -> None:
    """Anything ffprobe cannot answer counts as "no audio": one track staying
    silent beats failing the whole export."""
    broken = tmp_path / "broken.mp4"
    broken.write_bytes(b"not a video")
    assert has_audio_stream(broken) is False
    assert has_audio_stream(tmp_path / "gone.mp4") is False


def test_clip_sound_plays_its_trim_range_where_the_element_sits(
    tmp_path: Path, originals: dict[str, Path], reference: dict[str, float]
) -> None:
    """The element starts 2 s into the movie and plays seconds 1 to 4 of its
    video, so the track is silent before 2 s and audible from then on."""
    out = _mix(
        tmp_path,
        clips=[VideoClipAudioInput(media_id="loud", at=2.0, trim_in=1.0, trim_out=4.0)],
        balance=100.0,
        sources=originals,
        movie=6.0,
    )
    assert _rms_db(out, 0.2, 1.8) < SILENT
    assert _rms_db(out, 2.2, 4.8) == pytest.approx(reference["clip"], abs=0.6)
    assert _rms_db(out, 5.2, 5.9) < SILENT


def test_the_mix_stays_exactly_as_long_as_the_movie(
    tmp_path: Path, originals: dict[str, Path]
) -> None:
    out = _mix(
        tmp_path,
        music=[_music()],
        narration=[_narration(at=5.0, trim_end=4.0)],
        clips=[CLIP],
        sources=originals,
        movie=6.0,
    )
    [stream] = [s for s in _streams(out) if s["codec_type"] == "audio"]
    assert stream["sample_rate"] == "48000"
    assert stream["channels"] == 2
    assert int(stream["duration_ts"]) == 6 * 48000


# --- Through the API ----------------------------------------------------------------


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def _upload(client: TestClient, files: list[tuple[str, bytes]]) -> list[str]:
    res = client.post(
        "/api/media",
        files=[("files", (name, data, "application/octet-stream")) for name, data in files],
    )
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    assert all("item" in r for r in items), items
    return [r["item"]["id"] for r in items]


def _project(
    client: TestClient,
    originals: dict[str, Path],
    *,
    video: str = "loud",
    narration: bool = True,
    balance: int = 50,
) -> dict[str, Any]:
    """One 3 s video element plus a narration clip over it (3 s movie)."""
    [clip_id] = _upload(client, [(f"{video}.mp4", originals[video].read_bytes())])
    [voice_id] = _upload(client, [("voice.wav", originals["voice"].read_bytes())])
    project = {
        "schemaVersion": 6,
        "slides": [
            {
                "kind": "video",
                "id": "v1",
                "mediaId": clip_id,
                "trimIn": 1.0,
                "trimOut": 4.0,
                "effectId": None,
                "title": None,
                "transitionIn": None,
            }
        ],
        "music": [],
        "narration": (
            [
                {
                    "id": "n1",
                    "mediaId": voice_id,
                    "at": 1.0,
                    "trimStart": 0,
                    "trimEnd": 2.0,
                    "volume": 1,
                    "fadeIn": False,
                    "fadeOut": False,
                }
            ]
            if narration
            else []
        ),
        "clipAudioBalance": balance,
    }
    res = client.put("/api/project", json=project)
    assert res.status_code == 200, res.text
    return project


class RecordingExport:
    """Replaces `export_movie` without GL; keeps the mix it was handed."""

    def __init__(self) -> None:
        self.audio_args: list[str] = []
        self.mix: Path | None = None
        self.mix_duration: float | None = None

    def __call__(self, *args: Any, **kwargs: Any) -> Path:
        output: Path = args[3]
        self.audio_args = kwargs["audio_input"](3.0)
        if "-i" in self.audio_args:
            source = Path(self.audio_args[self.audio_args.index("-i") + 1])
            if source.is_file():
                # The export deletes the mix afterwards, so keep a copy.
                self.mix = output.parent / "kept.wav"
                self.mix.write_bytes(source.read_bytes())
                self.mix_duration = float(
                    next(s for s in _streams(source) if s["codec_type"] == "audio")["duration"]
                )
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(b"fake mp4")
        return output


@pytest.fixture
def recording(monkeypatch: pytest.MonkeyPatch) -> RecordingExport:
    fake = RecordingExport()
    monkeypatch.setattr("mmy_backend.exports.export_movie", fake)
    return fake


def _wait_final(client: TestClient, export_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + 120.0
    while time.monotonic() < deadline:
        job: dict[str, Any] = client.get(f"/api/exports/{export_id}").json()
        if job["status"] in ("done", "failed", "cancelled"):
            return job
        time.sleep(0.02)
    raise AssertionError(f"export {export_id} did not finish")


def _export(client: TestClient) -> dict[str, Any]:
    res = client.post("/api/exports", json={"profile": "small", "fileName": "Movie"})
    assert res.status_code == 202, res.text
    return _wait_final(client, str(res.json()["id"]))


def test_an_export_mixes_narration_and_clip_sound_together(
    client: TestClient, originals: dict[str, Path], recording: RecordingExport
) -> None:
    """End to end through the API: the project's own video sound and its
    narration both reach `music.wav`, each in its own window."""
    _project(client, originals)
    job = _export(client)
    assert job["status"] == "done", job
    assert recording.mix is not None
    assert recording.mix_duration == pytest.approx(3.0, abs=0.01)
    # Clip sound alone before the narration starts, both while it runs.
    clip_only = _rms_db(recording.mix, 0.2, 0.9)
    both = _rms_db(recording.mix, 1.2, 1.9)
    assert clip_only > SILENT
    assert both > clip_only + 1.0


def test_an_export_of_a_silent_video_without_narration_keeps_the_silent_track(
    client: TestClient, originals: dict[str, Path], recording: RecordingExport
) -> None:
    """design.md D1: a video element with no audio track is no clip-sound
    source, so with nothing else the export does not mix at all."""
    _project(client, originals, video="mute", narration=False)
    job = _export(client)
    assert job["status"] == "done", job
    assert recording.audio_args == silent_audio_input(3.0)
    assert recording.mix is None


def test_an_export_at_level_0_leaves_the_clip_sound_out(
    client: TestClient, originals: dict[str, Path], recording: RecordingExport
) -> None:
    """At 0 the clip sound is silent; with no music or narration either there is
    nothing to mix, so the probing of the videos is skipped too."""
    _project(client, originals, narration=False, balance=0)
    job = _export(client)
    assert job["status"] == "done", job
    assert recording.audio_args == silent_audio_input(3.0)


def test_narration_with_missing_media_is_rejected(
    client: TestClient, originals: dict[str, Path]
) -> None:
    """The export pre-check covers the narration track like the music track."""
    _project(client, originals)
    voice = client.get("/api/project").json()["narration"][0]["mediaId"]
    # A medium disappears behind the project's back (e.g. the file index changed).
    store = client.app.state.media  # type: ignore[attr-defined]
    store._items = [item for item in store._items if item.id != voice]
    res = client.post("/api/exports", json={"fileName": "Movie"})
    assert res.status_code == 422
    assert res.json()["detail"] == {
        "code": "export.missingNarrationMedia",
        "params": {"count": 1, "clips": "1", "mediaIds": voice},
        "message": "Cannot export: media missing for narration clip(s) 1.",
    }
    assert client.get("/api/exports").json() == {"items": []}


# --- End to end (GL) ----------------------------------------------------------------


def _export_mp4(client: TestClient, settings: Settings) -> Path:
    res = client.post("/api/exports", json={"profile": "small", "fileName": "Movie"})
    assert res.status_code == 202, res.text
    export_id = str(res.json()["id"])
    job = _wait_final(client, export_id)
    assert job["status"] == "done", job
    out = settings.data_dir / "exports" / export_id / "out.mp4"
    assert out.is_file()
    assert sorted(p.name for p in out.parent.iterdir()) == ["out.mp4"]
    return out


@requires_gl
@slow
def test_the_exported_movie_carries_clip_sound_and_narration(
    client: TestClient, settings: Settings, originals: dict[str, Path]
) -> None:
    """Spec movie-export "Clip-Ton und Erzählung im Export", all the way into the
    MP4: the AAC track is as long as the video and both sources are in it."""
    _project(client, originals)
    out = _export_mp4(client, settings)
    streams = _streams(out)
    [video] = [s for s in streams if s["codec_type"] == "video"]
    [audio] = [s for s in streams if s["codec_type"] == "audio"]
    assert audio["codec_name"] == "aac"
    assert audio["sample_rate"] == "48000"
    assert audio["channels"] == 2
    assert abs(float(audio["duration"]) - float(video["duration"])) <= 1 / 30
    clip_only = _rms_db(out, 0.2, 0.9)
    both = _rms_db(out, 1.2, 1.9)
    assert clip_only > -30.0
    assert both > clip_only + 1.0


@requires_gl
@slow
def test_the_exported_movie_is_silent_at_level_100_without_clip_sound(
    client: TestClient, settings: Settings, originals: dict[str, Path]
) -> None:
    """Spec movie-export "Reiner Clip-Ton": at 100 music and narration are not
    audible, and a video without an audio track adds nothing — so the track is
    silent."""
    _project(client, originals, video="mute", balance=100)
    out = _export_mp4(client, settings)
    streams = _streams(out)
    [video] = [s for s in streams if s["codec_type"] == "video"]
    [audio] = [s for s in streams if s["codec_type"] == "audio"]
    assert abs(float(audio["duration"]) - float(video["duration"])) <= 1 / 30
    assert _rms_db(out, 0.0, 3.0) == -math.inf
