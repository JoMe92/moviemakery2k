"""End to end: import → storyboard → transition → wizard → download (TASK-WEB-014).

The movie is saved via "Auf dem Computer speichern" (save to my computer) in
the task pane; ffprobe checks the profile (spec movie-export "Kleine Datei":
H.264 640x480, 30 fps, AAC) and that the duration matches the total preview
duration to within one frame of 1/30 s (spec movie-export "Dauer des Films").
Second flow (spec movie-export "Export abbrechen"): cancel with a confirmation,
after which no partial file is left.
"""

import json
import re
import subprocess
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import pytest
from mmy_backend.ffmpeg import ffprobe_binary
from playwright.sync_api import Locator, Page, expect

FRAME = 1 / 30
EXPORT_TIMEOUT_MS = 180_000
_TIME_RE = re.compile(r"/\s*(\d+):(\d{2}):(\d{2}),(\d{2})\s*$")


def total_seconds(time_display: Locator) -> float:
    """Total duration from the monitor time display ("0:00:05,00 / 0:00:13,75")."""
    match = _TIME_RE.search(time_display.inner_text())
    assert match, f"unexpected time display: {time_display.inner_text()!r}"
    h, m, s, cs = (int(g) for g in match.groups())
    return h * 3600 + m * 60 + s + cs / 100


def ffprobe(path: Path) -> dict[str, Any]:
    binary = ffprobe_binary()
    if binary is None:
        pytest.fail("ffprobe not found (Pixi environment or MMY_FFPROBE)")
    out = subprocess.run(
        [binary, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return json.loads(out)  # type: ignore[no-any-return]


def api_json(base: str, path: str) -> Any:
    with urllib.request.urlopen(f"{base}{path}", timeout=5) as response:
        return json.loads(response.read())


def build_project(page: Page, server: str, images: dict[str, Path], copies: int = 1) -> Locator:
    """Import red/blue/green, append them `copies` times, set "Schachbrett" before picture 2."""
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()
    names = ("rot.png", "blau.png", "gruen.png")
    page.locator("input[type=file]").set_input_files([images[n] for n in names])
    collection = page.get_by_role("list", name="Bilder")
    strip = page.get_by_role("list", name="Bildstreifen")
    count = 0
    for _ in range(copies):
        for name in names:
            collection.get_by_role("button", name=name).dblclick()
            count += 1
            expect(
                strip.get_by_role("button", name=f"Bild {count}: {name}, 5,00 s")
            ).to_be_visible()

    strip.get_by_role("button", name="Bild 2: blau.png, 5,00 s").click()
    page.get_by_role("button", name="Videoübergänge anzeigen").click()
    page.get_by_role("list", name="Übergänge").get_by_role("button", name="Schachbrett").dblclick()
    expect(
        page.get_by_role("button", name="Übergang vor Bild 2: Schachbrett, 1,25 s")
    ).to_be_visible()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()
    return strip


def open_wizard(page: Page, file_name: str, profile_label: str) -> Locator:
    """Open the wizard from the task pane, enter the name, pick the quality and start."""
    page.get_by_text("Auf dem Computer speichern").click()
    wizard = page.get_by_role("dialog", name="Film speichern")
    expect(wizard.get_by_role("heading", name="Dateiname")).to_be_visible()
    wizard.get_by_label("Dateiname:").fill(file_name)
    wizard.get_by_role("button", name="Weiter").click()
    expect(wizard.get_by_role("heading", name="Qualität")).to_be_visible()
    # A plain string does a literal (if case-insensitive) substring match; a regex built
    # from `profile_label` would need its "/" escaped for Playwright's own selector engine
    # (as in "Für E-Mail/Web"), not just for Python's `re`.
    wizard.get_by_role("radio", name=profile_label).check()
    wizard.get_by_role("button", name="Weiter").click()
    return wizard


def test_export_small_file_and_download(
    page: Page, server: str, images: dict[str, Path], tmp_path: Path
) -> None:
    build_project(page, server, images)
    # Total preview duration: 3 x 5 s - 1.25 s
    expected = total_seconds(page.get_by_label("Zeit"))
    assert expected == pytest.approx(13.75)

    wizard = open_wizard(page, "Mein Film", "Kleine Datei (640×480)")  # noqa: RUF001
    expect(wizard.get_by_role("heading", name="Fertig")).to_be_visible(timeout=EXPORT_TIMEOUT_MS)
    expect(wizard.get_by_text("Der Film „Mein Film.mp4“ wurde gespeichert.")).to_be_visible()

    with page.expect_download() as info:
        wizard.get_by_role("button", name="Film herunterladen").click()
    download = info.value
    assert download.failure() is None
    assert download.suggested_filename == "Mein Film.mp4"
    target = tmp_path / "download" / download.suggested_filename
    download.save_as(target)
    assert target.stat().st_size > 0

    probe = ffprobe(target)
    video = [s for s in probe["streams"] if s["codec_type"] == "video"]
    audio = [s for s in probe["streams"] if s["codec_type"] == "audio"]
    assert len(video) == 1 and len(audio) == 1, probe["streams"]
    v, a = video[0], audio[0]
    assert v["codec_name"] == "h264"
    assert (v["width"], v["height"]) == (640, 480)
    assert v["r_frame_rate"] == "30/1"
    assert v["avg_frame_rate"] == "30/1"
    assert a["codec_name"] == "aac"
    # Duration = preview ± 1 frame (spec movie-export "Dauer des Films"); the display is
    # rounded to 1/100 s.
    tolerance = FRAME + 0.005
    assert float(v["duration"]) == pytest.approx(expected, abs=tolerance)
    assert float(probe["format"]["duration"]) == pytest.approx(expected, abs=tolerance)

    wizard.get_by_role("button", name="Fertig stellen").click()
    expect(wizard).to_be_hidden()


def test_export_email_web_file_and_download(
    page: Page, server: str, images: dict[str, Path], tmp_path: Path
) -> None:
    build_project(page, server, images)
    expected = total_seconds(page.get_by_label("Zeit"))
    assert expected == pytest.approx(13.75)

    wizard = open_wizard(page, "Für E-Mail", "Für E-Mail/Web (320×240)")  # noqa: RUF001
    expect(wizard.get_by_role("heading", name="Fertig")).to_be_visible(timeout=EXPORT_TIMEOUT_MS)
    expect(wizard.get_by_text("Der Film „Für E-Mail.mp4“ wurde gespeichert.")).to_be_visible()

    with page.expect_download() as info:
        wizard.get_by_role("button", name="Film herunterladen").click()
    download = info.value
    assert download.failure() is None
    target = tmp_path / "download" / download.suggested_filename
    download.save_as(target)
    assert target.stat().st_size > 0

    probe = ffprobe(target)
    video = [s for s in probe["streams"] if s["codec_type"] == "video"]
    assert len(video) == 1, probe["streams"]
    v = video[0]
    assert v["codec_name"] == "h264"
    assert (v["width"], v["height"]) == (320, 240)
    assert v["r_frame_rate"] == "30/1"
    tolerance = FRAME + 0.005
    assert float(v["duration"]) == pytest.approx(expected, abs=tolerance)

    wizard.get_by_role("button", name="Fertig stellen").click()
    expect(wizard).to_be_hidden()


def test_cancel_export_leaves_no_file(
    page: Page, server: str, images: dict[str, Path], tmp_path: Path
) -> None:
    # 18 pictures (≈ 88 s of movie) in high quality: the export takes many seconds
    # even on fast machines (measured locally: 12 pictures ≈ 14 s), while the
    # confirmation prompt and its answer take less than a second.
    build_project(page, server, images, copies=6)
    wizard = open_wizard(page, "Abbruch", "Hohe Qualität (960×720)")  # noqa: RUF001
    expect(wizard.get_by_role("heading", name="Film wird gespeichert")).to_be_visible()
    expect(wizard.get_by_role("progressbar", name="Exportfortschritt")).to_be_visible()

    wizard.get_by_role("button", name="Abbrechen").click()
    confirm = page.get_by_role("dialog", name="Export abbrechen")
    expect(confirm.get_by_text("Export wirklich abbrechen?")).to_be_visible()
    # Before the confirmation the export is still running.
    items = api_json(server, "/api/exports")["items"]
    assert [i["status"] for i in items] in (["queued"], ["running"]), items
    confirm.get_by_role("button", name="Ja").click()

    expect(wizard).to_be_hidden()
    expect(confirm).to_be_hidden()
    items = api_json(server, "/api/exports")["items"]
    assert len(items) == 1, items
    assert items[0]["status"] == "cancelled"
    assert items[0]["fileName"] == "Abbruch"
    exports_dir = tmp_path / "data" / "exports"
    leftovers = [p for p in exports_dir.rglob("*") if p.is_file()] if exports_dir.exists() else []
    assert leftovers == []
    with pytest.raises(urllib.error.HTTPError) as error:
        urllib.request.urlopen(f"{server}/api/exports/{items[0]['id']}/file", timeout=5)
    assert error.value.code in (404, 409)
