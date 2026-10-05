"""End to end: an over-long title text never reaches the backend
(TASK-INFRA-029, limit-title-text-length design.md D1/D2, spec
titles-and-credits "Begrenzter Titeltext").

What this covers is an autosave that used to fail: the backend rejects a
title line longer than 200 characters, so one over-long text anywhere made
`PUT /api/project` refuse the whole project, and the user saw only the
generic error without learning which input caused it. The flow therefore
pours 500 characters into every field for title text - the wizard's two
line fields, its credits entries and the film-title field of the AutoMovie
dialog - and asserts each time that the element is built and that the
project the backend hands back carries the text cut to the limit.

`fill()` writes the value past the field's native `maxlength`, which is
exactly the paste case of design.md D2: what cuts it here is the
controlled change handler, so this flow guards that half of the fix too.
"""

import json
import re
import time
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from playwright.sync_api import Page, expect

# The backend's TITLE_LINE_MAX_LENGTH (backend/src/mmy_backend/project.py),
# mirrored for the web app in apps/web/src/titles/titleText.ts.
LIMIT = 200
TOO_LONG = 500


def saved_project(base: str) -> dict[str, Any]:
    with urllib.request.urlopen(f"{base}/api/project", timeout=5) as response:
        return json.loads(response.read())  # type: ignore[no-any-return]


def saved_titles(base: str) -> list[dict[str, Any]]:
    return [s for s in saved_project(base)["slides"] if s["kind"] == "title"]


def wait_for_titles(
    base: str, matches: Callable[[list[dict[str, Any]]], bool], what: str
) -> list[dict[str, Any]]:
    """The saved title elements once they satisfy `matches`.

    The autosave is debounced, so the GET races the PUT; polling for the
    expected state keeps the assertion about the limit instead of about
    timing. A project the backend refused never changes, so a real
    rejection runs into the timeout and fails here with the last state.
    """
    titles: list[dict[str, Any]] = []
    deadline = time.monotonic() + 15.0
    while time.monotonic() < deadline:
        titles = saved_titles(base)
        if matches(titles):
            return titles
        time.sleep(0.2)
    pytest.fail(f"the backend never saved {what}; last title elements: {titles}")


def test_over_long_title_text_is_limited_and_the_project_saves(
    page: Page, server: str, images: dict[str, Path]
) -> None:
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto(server)
    expect(page.get_by_text("Backend bereit")).to_be_visible()
    strip = page.get_by_role("list", name="Bildstreifen")

    # One picture, so the storyboard is not empty.
    page.locator("input[type=file]").set_input_files([images["rot.png"]])
    collection = page.get_by_role("list", name="Bilder")
    expect(collection.get_by_role("button", name="rot.png")).to_be_visible()
    collection.get_by_role("button", name="rot.png").dblclick()
    expect(strip.get_by_role("button", name="Bild 1: rot.png, 5,00 s")).to_be_visible()

    # --- Both line fields of the title wizard -------------------------------
    page.get_by_role("button", name="Titel oder Nachspann erstellen").click()
    wizard = page.get_by_role("dialog", name="Titel oder Nachspann erstellen")
    wizard.get_by_role("radio", name="Am Filmanfang").check()
    wizard.get_by_role("button", name="Weiter").click()
    wizard.get_by_label("Zeile 1:").fill("A" * TOO_LONG)
    wizard.get_by_label("Zeile 2:").fill("B" * TOO_LONG)
    # Nothing longer than the limit is even in the field.
    expect(wizard.get_by_label("Zeile 1:")).to_have_value("A" * LIMIT)
    expect(wizard.get_by_label("Zeile 2:")).to_have_value("B" * LIMIT)
    wizard.get_by_role("button", name="Weiter").click()
    wizard.get_by_role("radio", name="Ein- und Ausblenden", exact=True).check()
    wizard.get_by_role("button", name="Weiter").click()
    wizard.get_by_role("radio", name="Weiß", exact=True).check()
    wizard.get_by_role("button", name="Fertig").click()
    expect(wizard).to_be_hidden()

    # The tile names a title element by its first line (add-titles-and-credits).
    expect(
        strip.get_by_role("button", name=re.compile(r"^Titel 1: A{200}, 5,00 s$"))
    ).to_be_visible()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()
    titles = wait_for_titles(
        server,
        lambda ts: len(ts) == 1 and ts[0]["lines"] == ["A" * LIMIT, "B" * LIMIT],
        "the two-line title cut to the limit",
    )
    assert [len(line) for line in titles[0]["lines"]] == [LIMIT, LIMIT]

    # --- The credits entries of the title wizard ----------------------------
    long_entry = f"Regie: {'C' * TOO_LONG}"
    page.get_by_role("button", name="Titel oder Nachspann erstellen").click()
    wizard.get_by_role("radio", name="Am Filmende").check()
    wizard.get_by_role("button", name="Weiter").click()
    wizard.get_by_label("Zeile 1:").fill("Platzhalter")
    wizard.get_by_role("button", name="Weiter").click()
    wizard.get_by_role("radio", name="Nach oben rollen, gestapelt", exact=True).check()
    # Back to "Text": a credits style offers the entry list instead of lines.
    wizard.get_by_role("button", name="Zurück").click()
    wizard.get_by_label("Einträge:").fill(f"{long_entry}\nKamera: Ich")
    # The limit is per entry, so the short second entry stays untouched.
    expect(wizard.get_by_label("Einträge:")).to_have_value(f"{long_entry[:LIMIT]}\nKamera: Ich")
    wizard.get_by_role("button", name="Weiter").click()
    wizard.get_by_role("button", name="Weiter").click()
    wizard.get_by_role("button", name="Fertig").click()
    expect(wizard).to_be_hidden()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()

    titles = wait_for_titles(
        server,
        lambda ts: len(ts) == 2 and ts[-1]["creditEntries"] == [long_entry[:LIMIT], "Kamera: Ich"],
        "the credits entries cut one by one",
    )
    assert [len(entry) for entry in titles[-1]["creditEntries"]] == [
        LIMIT,
        len("Kamera: Ich"),
    ]

    # --- The film title of the AutoMovie dialog -----------------------------
    page.get_by_role("menuitem", name="Extras", exact=True).click()
    page.get_by_role("menuitem", name="AutoMovie…", exact=True).click()
    dialog = page.get_by_role("dialog", name="AutoMovie")
    dialog.get_by_label("Filmtitel:").fill("T" * TOO_LONG)
    expect(dialog.get_by_label("Filmtitel:")).to_have_value("T" * LIMIT)
    dialog.get_by_role("radio", name=re.compile("Klassisch")).check()
    dialog.get_by_role("button", name="Erstellen").click()
    # The storyboard is not empty, so AutoMovie asks before replacing it.
    page.get_by_role("button", name="Ja").click()
    expect(dialog).to_be_hidden()

    expect(
        strip.get_by_role("button", name=re.compile(r"^Titel 1: T{200}, 5,00 s$"))
    ).to_be_visible()
    expect(page.get_by_text("Gespeichert", exact=True)).to_be_visible()
    titles = wait_for_titles(
        server,
        lambda ts: len(ts) == 2 and ts[0]["lines"] == ["T" * LIMIT],
        "the AutoMovie film title cut to the limit",
    )
    assert titles[-1]["lines"] == ["Ende"], "the closing title should still be there"
