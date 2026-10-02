"""Ende-zu-Ende: Import → Bildstreifen → Übergang → Play → Reload (TASK-WEB-011).

Der Monitor wird per Element-Screenshot ausgewertet; ein WebGL-Canvas ohne
preserveDrawingBuffer lässt sich nicht zuverlässig per drawImage auslesen.
"""

import io
from pathlib import Path

from PIL import Image
from playwright.sync_api import Locator, Page, expect


def mean_rgb(locator: Locator) -> tuple[float, float, float]:
    img = Image.open(io.BytesIO(locator.screenshot())).convert("RGB")
    # Nur die Bildmitte, Letterbox-Ränder sind schwarz.
    w, h = img.size
    crop = img.crop((w // 4, h // 4, 3 * w // 4, 3 * h // 4))
    pixels = list(crop.getdata())
    n = len(pixels)
    return (
        sum(p[0] for p in pixels) / n,
        sum(p[1] for p in pixels) / n,
        sum(p[2] for p in pixels) / n,
    )


def drag(page: Page, source: Locator, target: Locator) -> None:
    """Echter Zeiger-Drag in Schritten (dnd-kit braucht > 5 px Bewegung)."""
    s = source.bounding_box()
    t = target.bounding_box()
    assert s and t
    page.mouse.move(s["x"] + s["width"] / 2, s["y"] + s["height"] / 2)
    page.mouse.down()
    page.mouse.move(s["x"] + s["width"] / 2 + 10, s["y"] + s["height"] / 2 + 10, steps=5)
    page.mouse.move(t["x"] + t["width"] - 20, t["y"] + t["height"] / 2, steps=20)
    page.mouse.up()


def test_build_and_play_a_slideshow(page: Page, server: str, images: dict[str, Path]) -> None:
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()

    # Import über den (versteckten) Dateidialog
    page.locator("input[type=file]").set_input_files(
        [images["rot.png"], images["blau.png"], images["gruen.png"]]
    )
    collection = page.get_by_role("list", name="Bilder")
    for name in ("rot.png", "blau.png", "gruen.png"):
        expect(collection.get_by_role("button", name=name)).to_be_visible()

    # Doppelklick hängt an, echter Drag fügt am Ende ein
    collection.get_by_role("button", name="rot.png").dblclick()
    collection.get_by_role("button", name="blau.png").dblclick()
    strip = page.get_by_role("list", name="Bildstreifen")
    expect(strip.get_by_role("button", name="Bild 2: blau.png, 5,00 s")).to_be_visible()
    drag(page, collection.get_by_role("button", name="gruen.png"), strip)
    # Select tile 2 with the very first click right after the drop, without waiting
    # (mmy-fa5); the exact 50 ms timing is covered by the Vitest storyboard test.
    second = strip.get_by_role("button", name="Bild 2: blau.png, 5,00 s")
    box = second.bounding_box()
    assert box
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    expect(second).to_have_attribute("aria-pressed", "true")
    expect(strip.get_by_role("button", name="Bild 3: gruen.png, 5,00 s")).to_be_visible()

    # Übergang „Kreis“ vor Bild 2: Katalog öffnen, Doppelklick auf die Kachel
    page.get_by_role("button", name="Videoübergänge anzeigen").click()
    page.get_by_role("list", name="Übergänge").get_by_role("button", name="Kreis").dblclick()
    expect(page.get_by_role("button", name="Übergang vor Bild 2: Kreis, 1,25 s")).to_be_visible()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()

    # Wiedergabe: Gesamtdauer 15 − 1,25 = 13,75 s
    # Auswahl von Bild 2 springt im Stopp-Zustand an dessen Start (Spec preview-player)
    time = page.get_by_label("Zeit")
    expect(time).to_have_text("0:00:05,00 / 0:00:13,75")
    monitor = page.get_by_role("img", name="Vorschaubild")
    page.get_by_role("button", name="Stopp").click()
    expect(time).to_have_text("0:00:00,00 / 0:00:13,75")
    start = mean_rgb(monitor)
    assert start[0] > 150 and start[2] < 80, f"Start sollte rot sein: {start}"

    page.get_by_role("button", name="Wiedergabe").click()
    expect(page.get_by_role("button", name="Pause")).to_be_visible()
    expect(time).not_to_have_text("0:00:00,00 / 0:00:13,75")

    # Suchen hinter den Übergang → Bild 2 (blau)
    page.get_by_role("button", name="Pause").click()
    page.get_by_role("button", name="Nächstes Bild").click()
    expect(time).to_have_text("0:00:05,00 / 0:00:13,75")
    later = mean_rgb(monitor)
    assert later[2] > 150 and later[0] < 80, f"Bild 2 sollte blau sein: {later}"

    # Reload: alles wiederhergestellt
    page.reload()
    strip = page.get_by_role("list", name="Bildstreifen")
    expect(strip.get_by_role("button", name="Bild 3: gruen.png, 5,00 s")).to_be_visible()
    expect(page.get_by_role("button", name="Übergang vor Bild 2: Kreis, 1,25 s")).to_be_visible()


def test_invalid_upload_is_reported_per_file(page: Page, server: str, tmp_path: Path, images: dict[str, Path]) -> None:
    fake = tmp_path / "kaputt.jpg"
    fake.write_text("kein Bild")
    page.goto(server)
    page.locator("input[type=file]").set_input_files([images["rot.png"], fake])
    expect(page.get_by_role("list", name="Bilder").get_by_role("button", name="rot.png")).to_be_visible()
    expect(page.get_by_text("kaputt.jpg")).to_be_visible()
