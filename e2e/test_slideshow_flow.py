"""End to end: import → storyboard → transition → play → reload (TASK-WEB-011);
video import into "Meine Videos" (TASK-INFRA-019, add-video-import).

The monitor is evaluated from an element screenshot; a WebGL canvas without
preserveDrawingBuffer cannot be read back reliably with drawImage.
"""

import io
from pathlib import Path

from PIL import Image, ImageStat
from playwright.sync_api import Locator, Page, expect


def mean_rgb(locator: Locator) -> tuple[float, float, float]:
    img = Image.open(io.BytesIO(locator.screenshot())).convert("RGB")
    # Only the centre of the picture; the letterbox bars are black.
    w, h = img.size
    crop = img.crop((w // 4, h // 4, 3 * w // 4, 3 * h // 4))
    r, g, b = ImageStat.Stat(crop).mean
    return (r, g, b)


def drag(page: Page, source: Locator, target: Locator) -> None:
    """Real pointer drag in steps (dnd-kit needs > 5 px of movement)."""
    s = source.bounding_box()
    t = target.bounding_box()
    assert s and t
    page.mouse.move(s["x"] + s["width"] / 2, s["y"] + s["height"] / 2)
    page.mouse.down()
    page.mouse.move(s["x"] + s["width"] / 2 + 10, s["y"] + s["height"] / 2 + 10, steps=5)
    page.mouse.move(t["x"] + t["width"] - 20, t["y"] + t["height"] / 2, steps=20)
    page.mouse.up()


def test_build_and_play_a_slideshow(
    page: Page, server: str, images: dict[str, Path], video: Path
) -> None:
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()

    # Import through the (hidden) file dialog
    page.locator("input[type=file]").set_input_files(
        [images["rot.png"], images["blau.png"], images["gruen.png"]]
    )
    collection = page.get_by_role("list", name="Bilder")
    for name in ("rot.png", "blau.png", "gruen.png"):
        expect(collection.get_by_role("button", name=name)).to_be_visible()

    # Double-click appends, a real drag inserts at the end
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

    # Transition "Kreis" (circle) before picture 2: open the catalog, double-click the tile
    page.get_by_role("button", name="Videoübergänge anzeigen").click()
    page.get_by_role("list", name="Übergänge").get_by_role(
        "button", name="Kreis", exact=True
    ).dblclick()
    expect(page.get_by_role("button", name="Übergang vor Bild 2: Kreis, 1,25 s")).to_be_visible()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()
    # The click starts the demo, labelled as a sample (design.md D7).
    sample = page.get_by_text("Beispiel: Kreis", exact=True)
    expect(sample).to_be_visible()

    # Playback: total duration 15 - 1.25 = 13.75 s.
    # Selecting picture 2 while stopped jumps to its start
    # (spec preview-player "Auswahl im Storyboard").
    time = page.get_by_label("Zeit")
    expect(time).to_have_text("0:00:05,00 / 0:00:13,75")
    monitor = page.get_by_role("img", name="Vorschaubild")
    page.get_by_role("button", name="Stopp").click()
    expect(time).to_have_text("0:00:00,00 / 0:00:13,75")
    expect(sample).to_have_count(0)
    start = mean_rgb(monitor)
    assert start[0] > 150 and start[2] < 80, f"start should be red: {start}"

    page.get_by_role("button", name="Wiedergabe").click()
    expect(page.get_by_role("button", name="Pause")).to_be_visible()
    expect(time).not_to_have_text("0:00:00,00 / 0:00:13,75")

    # Seek past the transition → picture 2 (blue)
    page.get_by_role("button", name="Pause").click()
    page.get_by_role("button", name="Nächstes Bild").click()
    expect(time).to_have_text("0:00:05,00 / 0:00:13,75")
    later = mean_rgb(monitor)
    assert later[2] > 150 and later[0] < 80, f"picture 2 should be blue: {later}"

    # Video: a video-only import switches to "Meine Videos" with a poster and
    # duration tile (add-video-import D4; cannot yet be added to the storyboard).
    page.locator("input[type=file]").set_input_files(video)
    video_tile = page.get_by_role("list", name="Videos").get_by_role(
        "button", name="urlaub.mp4, 1:45"
    )
    expect(video_tile).to_be_visible()
    expect(video_tile.get_by_role("img")).to_be_visible()

    # Reload: everything is restored
    page.reload()
    strip = page.get_by_role("list", name="Bildstreifen")
    expect(strip.get_by_role("button", name="Bild 3: gruen.png, 5,00 s")).to_be_visible()
    expect(page.get_by_role("button", name="Übergang vor Bild 2: Kreis, 1,25 s")).to_be_visible()
    page.get_by_role("combobox", name="Sammlungen:").select_option("video")
    expect(
        page.get_by_role("list", name="Videos").get_by_role("button", name="urlaub.mp4, 1:45")
    ).to_be_visible()


def test_undo_redo_and_clipboard(page: Page, server: str, images: dict[str, Path]) -> None:
    """Add, reorder, undo/redo, copy/paste a picture (spec edit-commands); a
    reload keeps the confirmed storyboard but not the undo history."""
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()

    page.locator("input[type=file]").set_input_files([images["rot.png"], images["blau.png"]])
    collection = page.get_by_role("list", name="Bilder")
    for name in ("rot.png", "blau.png"):
        expect(collection.get_by_role("button", name=name)).to_be_visible()

    collection.get_by_role("button", name="rot.png").dblclick()
    collection.get_by_role("button", name="blau.png").dblclick()
    strip = page.get_by_role("list", name="Bildstreifen")
    first = strip.get_by_role("button", name="Bild 1: rot.png, 5,00 s")
    expect(first).to_be_visible()
    expect(strip.get_by_role("button", name="Bild 2: blau.png, 5,00 s")).to_be_visible()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()

    # Reorder by keyboard drag (dnd instructions: Enter picks up, arrow keys
    # move, Enter drops): the red picture moves after the blue one.
    first.focus()
    page.keyboard.press("Enter")
    # dnd-kit's keyboard sensor attaches its move/drop listener via setTimeout(0);
    # without a beat here, a key pressed right after pickup can arrive too early.
    page.wait_for_timeout(50)
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(50)
    page.keyboard.press("Enter")
    expect(strip.get_by_role("button", name="Bild 1: blau.png, 5,00 s")).to_be_visible()
    expect(strip.get_by_role("button", name="Bild 2: rot.png, 5,00 s")).to_be_visible()

    # Strg+Z undoes the reorder, Strg+Y redoes it.
    page.keyboard.press("Control+z")
    expect(strip.get_by_role("button", name="Bild 1: rot.png, 5,00 s")).to_be_visible()
    page.keyboard.press("Control+y")
    expect(strip.get_by_role("button", name="Bild 1: blau.png, 5,00 s")).to_be_visible()
    expect(strip.get_by_role("button", name="Bild 2: rot.png, 5,00 s")).to_be_visible()

    # Select the red picture, copy it with Strg+C, paste with Strg+V: a
    # duplicate without an incoming transition appears right after it.
    rot_tile = strip.get_by_role("button", name="Bild 2: rot.png, 5,00 s")
    box = rot_tile.bounding_box()
    assert box
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    expect(rot_tile).to_have_attribute("aria-pressed", "true")
    page.keyboard.press("Control+c")
    page.keyboard.press("Control+v")
    expect(strip.get_by_role("button", name="Bild 3: rot.png, 5,00 s")).to_be_visible()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()

    # Reload: the storyboard keeps the last confirmed state, but Undo/Redo
    # are disabled again (the history does not survive a reload).
    page.reload()
    strip = page.get_by_role("list", name="Bildstreifen")
    expect(strip.get_by_role("button", name="Bild 1: blau.png, 5,00 s")).to_be_visible()
    expect(strip.get_by_role("button", name="Bild 2: rot.png, 5,00 s")).to_be_visible()
    expect(strip.get_by_role("button", name="Bild 3: rot.png, 5,00 s")).to_be_visible()
    page.get_by_role("menuitem", name="Bearbeiten").click()
    expect(page.get_by_role("menuitem", name="Rückgängig")).to_have_attribute(
        "aria-disabled", "true"
    )
    expect(page.get_by_role("menuitem", name="Wiederholen")).to_have_attribute(
        "aria-disabled", "true"
    )


def test_invalid_upload_is_reported_per_file(
    page: Page, server: str, tmp_path: Path, images: dict[str, Path]
) -> None:
    fake = tmp_path / "kaputt.jpg"
    fake.write_text("kein Bild")
    page.goto(server)
    page.locator("input[type=file]").set_input_files([images["rot.png"], fake])
    collection = page.get_by_role("list", name="Bilder")
    expect(collection.get_by_role("button", name="rot.png")).to_be_visible()
    expect(page.get_by_text("kaputt.jpg")).to_be_visible()
