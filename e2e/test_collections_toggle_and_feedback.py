"""End to end: the collections toggle and the confirmation when adding
(add-collections-toggle-and-feedback TASK-INFRA-028, design.md D8).

Two things the Product Owner asked for on 2026-10-04:

- on the phone, adding pictures from the collection sheet has to say that it
  happened - a short notice to read and the pictures to see in the filmstrip;
- on the desktop, the collection pane has to get out of the way, and any
  choice of a collection has to bring it back.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from playwright.sync_api import Browser, Page, Playwright, expect
from test_mobile import device, tap_import

PICTURES = ("rot.png", "gruen.png", "blau.png")


@pytest.fixture
def phone(browser: Browser, playwright: Playwright, server: str) -> Iterator[Page]:
    """A phone in portrait with touch, loaded and settled (as in test_mobile)."""
    context = browser.new_context(**device(playwright, "Pixel 7"))
    page = context.new_page()
    page.goto(server)
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Backend bereit")).to_be_hidden()
    yield page
    context.close()


def test_adding_on_a_phone_says_so(phone: Page, images: dict[str, Path]) -> None:
    """The Product Owner's way: pick several pictures, add them, read the
    short notice, see the pictures in the filmstrip."""
    page = phone
    # "1. Aufnehmen" → "Bilder importieren" opens the sheet on "Meine Bilder".
    tap_import(page, "Bilder importieren", [images[n] for n in PICTURES])
    sheet = page.get_by_role("dialog", name="Sammlungen")
    tiles = sheet.get_by_role("list", name="Bilder")
    for name in PICTURES:
        expect(tiles.get_by_role("button", name=name)).to_be_visible()

    for name in PICTURES:
        tiles.get_by_role("button", name=name).tap()
    sheet.get_by_role("button", name="Zum Bildstreifen hinzufügen (3)").tap()
    expect(sheet).to_be_hidden()

    # The notice says what happened …
    notice = page.get_by_text("3 Bilder hinzugefügt")
    expect(notice).to_be_visible()
    # … and the pictures are there to check it against.
    strip = page.get_by_role("list", name="Bildstreifen")
    for number, name in enumerate(PICTURES, start=1):
        expect(strip.get_by_role("button", name=f"Bild {number}: {name}")).to_be_visible()
    # The notice goes away by itself; it is no permanent banner.
    expect(notice).to_be_hidden(timeout=5000)


def test_the_desktop_collection_pane_hides_and_comes_back(page: Page, server: str) -> None:
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()

    toolbar = page.get_by_role("toolbar", name="Symbolleiste")
    toggle = toolbar.get_by_role("button", name="Sammlungen")
    pictures = page.get_by_role("region", name="Sammlung: Meine Bilder")
    tasks = page.get_by_role("complementary", name="Filmaufgaben")
    monitor = page.get_by_role("region", name="Vorschau")
    expect(toggle).to_have_attribute("aria-pressed", "true")
    expect(pictures).to_be_visible()
    narrow = monitor.bounding_box()
    task_pane = tasks.bounding_box()
    assert narrow and task_pane

    toggle.click()

    expect(pictures).to_be_hidden()
    expect(toggle).to_have_attribute("aria-pressed", "false")
    # The freed space goes to the monitor; the task pane does not move.
    wide = monitor.bounding_box()
    assert wide and wide["width"] > narrow["width"] + 100
    assert tasks.bounding_box() == task_pane
    expect(page.get_by_role("region", name="Storyboard")).to_be_visible()
    expect(page.get_by_role("contentinfo")).to_be_visible()

    # The collection picker stays usable and brings the pane back.
    picker = toolbar.get_by_role("combobox", name="Sammlungen:")
    expect(picker).to_be_enabled()
    picker.select_option("transitions")

    expect(page.get_by_role("region", name="Sammlung: Videoübergänge")).to_be_visible()
    expect(toggle).to_have_attribute("aria-pressed", "true")
    expect(picker).to_have_value("transitions")
