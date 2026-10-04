"""End to end: UI language (spec localization "Wahl der Sprache", TASK-WEB-020).

The default `page` runs with browser locale `de-DE` (conftest.py), so the app
starts in German. One test switches to English via Tools → Options and checks
menus, catalog names and the time display; the others start fresh contexts with
other browser locales and check the detected language.
"""

import re
from pathlib import Path

import pytest
from playwright.sync_api import Browser, Page, expect

MENUS_DE = ["Datei", "Bearbeiten", "Ansicht", "Extras", "Clip", "Wiedergabe", "Hilfe"]
MENUS_EN = ["File", "Edit", "View", "Tools", "Clip", "Play", "Help"]


def expect_menus(page: Page, bar: str, labels: list[str]) -> None:
    menubar = page.get_by_role("menubar", name=bar)
    expect(menubar.locator("[aria-haspopup=menu]")).to_have_text(labels)


def test_switch_to_english_via_options(page: Page, server: str, images: dict[str, Path]) -> None:
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.locator("html")).to_have_attribute("lang", "de")
    expect_menus(page, "Menüleiste", MENUS_DE)
    expect(page.get_by_text("Backend bereit")).to_be_visible()

    # Build the storyboard in German: three pictures of 5 s each (default duration).
    page.locator("input[type=file]").set_input_files(
        [images["rot.png"], images["blau.png"], images["gruen.png"]]
    )
    collection = page.get_by_role("list", name="Bilder")
    for name in ("rot.png", "blau.png", "gruen.png"):
        collection.get_by_role("button", name=name).dblclick()
    strip = page.get_by_role("list", name="Bildstreifen")
    expect(strip.get_by_role("button", name="Bild 3: gruen.png, 5,00 s")).to_be_visible()
    expect(page.get_by_label("Zeit")).to_have_text("0:00:00,00 / 0:00:15,00")

    # Tools → Options…: choose English and confirm.
    page.get_by_role("menuitem", name="Extras", exact=True).click()
    page.get_by_role("menuitem", name="Optionen…", exact=True).click()
    dialog = page.get_by_role("dialog", name="Optionen")
    expect(dialog.get_by_role("radio", name="Deutsch")).to_be_checked()
    dialog.get_by_role("radio", name="English").check()
    dialog.get_by_role("button", name="OK").click()
    expect(dialog).to_be_hidden()

    # The whole UI switches at once; the storyboard is unchanged.
    expect(page.locator("html")).to_have_attribute("lang", "en")
    expect_menus(page, "Menu bar", MENUS_EN)
    strip = page.get_by_role("list", name="Storyboard strip")
    expect(strip.get_by_role("button", name=re.compile(r"^Picture \d+: "))).to_have_count(3)
    for number, name in enumerate(("rot.png", "blau.png", "gruen.png"), start=1):
        expect(
            strip.get_by_role("button", name=f"Picture {number}: {name}, 5.00 s")
        ).to_be_visible()
    time = page.get_by_label("Time")
    expect(time).to_have_text("0:00:00.00 / 0:00:15.00")

    # Transition catalog in English: "Circle" before pictures 2 and 3 (1.25 s each).
    page.get_by_role("button", name="View video transitions").click()
    circle = page.get_by_role("list", name="Transitions").get_by_role(
        "button", name="Circle", exact=True
    )
    expect(circle).to_be_visible()
    for number in (2, 3):
        strip.get_by_role("button", name=re.compile(rf"^Picture {number}: ")).click()
        circle.dblclick()
        expect(
            page.get_by_role("button", name=f"Transition before picture {number}: Circle, 1.25 s")
        ).to_be_visible()
    expect(page.get_by_text("Saved", exact=True)).to_be_visible()

    # Time display with "." as decimal separator: 15 - 2 x 1.25 = 12.50 s.
    page.get_by_role("button", name="Stop").click()
    expect(time).to_have_text("0:00:00.00 / 0:00:12.50")
    page.get_by_role("button", name="Next picture").click()
    expect(time).to_have_text("0:00:05.00 / 0:00:12.50")

    # The choice is persisted and wins over the German browser locale after a reload.
    page.reload()
    expect(page.locator("html")).to_have_attribute("lang", "en")
    expect_menus(page, "Menu bar", MENUS_EN)
    expect(page.get_by_text("Backend ready")).to_be_visible()
    expect(
        page.get_by_role("button", name="Transition before picture 3: Circle, 1.25 s")
    ).to_be_visible()
    expect(page.get_by_label("Time")).to_have_text("0:00:00.00 / 0:00:12.50")


@pytest.mark.parametrize(
    ("locale", "lang", "bar", "menus"),
    [
        ("en-US", "en", "Menu bar", MENUS_EN),
        ("fr-FR", "en", "Menu bar", MENUS_EN),
        ("de-AT", "de", "Menüleiste", MENUS_DE),
    ],
)
def test_first_start_follows_browser_locale(
    browser: Browser, server: str, locale: str, lang: str, bar: str, menus: list[str]
) -> None:
    # A fresh context has empty storage, so only the browser language decides.
    context = browser.new_context(locale=locale)
    try:
        page = context.new_page()
        page.goto(server)
        expect(page.locator("html")).to_have_attribute("lang", lang)
        expect_menus(page, bar, menus)
    finally:
        context.close()
