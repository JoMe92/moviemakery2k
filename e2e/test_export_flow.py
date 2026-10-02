"""Ende-zu-Ende: Import → Bildstreifen → Übergang → Assistent → Download (TASK-WEB-014).

Spec movie-export: Der Film wird über „Auf dem Computer speichern“ im
Aufgabenbereich gespeichert; ffprobe prüft das Profil „Kleine Datei“
(H.264 640×480, 30 fps, AAC) und dass die Dauer der Gesamtdauer der Vorschau
auf ein Bild (1/30 s) genau entspricht. Zweiter Ablauf: Abbrechen mit
Rückfrage, danach keine Teildatei.
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
    """Gesamtdauer aus der Zeitanzeige des Monitors („0:00:05,00 / 0:00:13,75“)."""
    match = _TIME_RE.search(time_display.inner_text())
    assert match, f"Zeitanzeige unerwartet: {time_display.inner_text()!r}"
    h, m, s, cs = (int(g) for g in match.groups())
    return h * 3600 + m * 60 + s + cs / 100


def ffprobe(path: Path) -> dict[str, Any]:
    binary = ffprobe_binary()
    if binary is None:
        pytest.fail("ffprobe nicht gefunden (Pixi-Umgebung oder MMY_FFPROBE)")
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
    """Importiert Rot/Blau/Grün, hängt sie `copies`-mal an und setzt „Schachbrett“ vor Bild 2."""
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
    """Assistent über den Aufgabenbereich öffnen, Namen eingeben, Qualität wählen, starten."""
    page.get_by_text("Auf dem Computer speichern").click()
    wizard = page.get_by_role("dialog", name="Film speichern")
    expect(wizard.get_by_role("heading", name="Dateiname")).to_be_visible()
    wizard.get_by_label("Dateiname:").fill(file_name)
    wizard.get_by_role("button", name="Weiter").click()
    expect(wizard.get_by_role("heading", name="Qualität")).to_be_visible()
    wizard.get_by_role("radio", name=re.compile(re.escape(profile_label))).check()
    wizard.get_by_role("button", name="Weiter").click()
    return wizard


def test_export_small_file_and_download(
    page: Page, server: str, images: dict[str, Path], tmp_path: Path
) -> None:
    build_project(page, server, images)
    # Gesamtdauer der Vorschau: 3 × 5 s − 1,25 s
    expected = total_seconds(page.get_by_label("Zeit"))
    assert expected == pytest.approx(13.75)

    wizard = open_wizard(page, "Mein Film", "Kleine Datei (640×480)")
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
    # Dauer = Vorschau ± 1 Bild (Spec „Dauer des Films“); Anzeige ist auf 1/100 s gerundet.
    tolerance = FRAME + 0.005
    assert float(v["duration"]) == pytest.approx(expected, abs=tolerance)
    assert float(probe["format"]["duration"]) == pytest.approx(expected, abs=tolerance)

    wizard.get_by_role("button", name="Fertig stellen").click()
    expect(wizard).to_be_hidden()


def test_cancel_export_leaves_no_file(
    page: Page, server: str, images: dict[str, Path], tmp_path: Path
) -> None:
    # 18 Bilder (≈ 88 s Film) in hoher Qualität: Der Export dauert auch auf
    # schnellen Rechnern viele Sekunden (lokal gemessen: 12 Bilder ≈ 14 s), die
    # Rückfrage samt Bestätigung dagegen unter einer Sekunde.
    build_project(page, server, images, copies=6)
    wizard = open_wizard(page, "Abbruch", "Hohe Qualität (960×720)")
    expect(wizard.get_by_role("heading", name="Film wird gespeichert")).to_be_visible()
    expect(wizard.get_by_role("progressbar", name="Exportfortschritt")).to_be_visible()

    wizard.get_by_role("button", name="Abbrechen").click()
    confirm = page.get_by_role("dialog", name="Export abbrechen")
    expect(confirm.get_by_text("Export wirklich abbrechen?")).to_be_visible()
    # Vor der Bestätigung läuft der Export noch.
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
