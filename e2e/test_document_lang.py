"""End to end: `<html lang>` is set before the app script runs.

Spec app-shell / localization, harden-export-and-ui design.md D8, TASK-WEB-025.
The app's JavaScript bundle is blocked, so only the inline script in
`index.html` can set the language; the app itself never starts.
"""

import json

import pytest
from playwright.sync_api import Browser, Route, expect


@pytest.mark.parametrize(
    ("locale", "stored", "lang"),
    [
        ("de-DE", "en", "en"),
        ("fr-FR", None, "en"),
        ("en-US", "de", "de"),
        ("de-AT", None, "de"),
    ],
)
def test_lang_is_set_before_the_app_script(
    browser: Browser, server: str, locale: str, stored: str | None, lang: str
) -> None:
    context = browser.new_context(locale=locale)
    try:
        if stored is not None:
            context.add_init_script(
                f"window.localStorage.setItem('mmy.locale', {json.dumps(stored)});"
            )
        page = context.new_page()
        blocked: list[str] = []

        def block_module(route: Route) -> None:
            blocked.append(route.request.url)
            route.abort()

        page.route("**/assets/*.js", block_module)
        page.goto(server)

        # The app bundle was requested and blocked, so the app never ran.
        assert blocked, "the app script was not requested"
        expect(page.locator("#root")).to_be_empty()
        expect(page.get_by_role("menubar")).to_have_count(0)
        expect(page.locator("html")).to_have_attribute("lang", lang)
    finally:
        context.close()
