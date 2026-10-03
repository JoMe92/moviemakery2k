"""End to end: LAN mode with access token (add-mobile-delivery design.md D1, D2, D9).

Starts `scripts/serve_lan.py` without a certificate on a random port. It binds
to 127.0.0.1 here (`--host`) so the test never opens a port to the network;
the token comes from the token file in the test's data directory.
"""

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Iterator
from pathlib import Path
from typing import NamedTuple

import pytest
from conftest import ROOT, WEB_DIST, _free_port
from playwright.sync_api import Browser, expect


class Lan(NamedTuple):
    base: str
    token: str


@pytest.fixture
def lan(tmp_path: Path) -> Iterator[Lan]:
    if not (WEB_DIST / "index.html").is_file():
        pytest.fail("apps/web/dist is missing - run via `pixi run test-e2e` (builds it first).")
    port = _free_port()
    data = tmp_path / "data"
    env = {**os.environ, "MMY_DATA_DIR": str(data), "MMY_WEB_DIST": str(WEB_DIST)}
    env.pop("MMY_ACCESS_TOKEN", None)
    proc = subprocess.Popen(
        [
            sys.executable,
            str(ROOT / "scripts" / "serve_lan.py"),
            *("--host", "127.0.0.1", "--port", str(port)),
        ],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(150):
            try:
                # The app shell answers without a token.
                with urllib.request.urlopen(f"{base}/manifest.webmanifest", timeout=1):
                    break
            except OSError:
                if proc.poll() is not None:
                    pytest.fail("serve-lan exited early")
                time.sleep(0.1)
        else:
            pytest.fail("serve-lan did not start")
        token = (data / "lan-token").read_text(encoding="utf-8").strip()
        yield Lan(base, token)
    finally:
        proc.terminate()
        proc.wait(timeout=10)


def test_without_token_shows_access_required(browser: Browser, lan: Lan) -> None:
    context = browser.new_context(locale="de-DE")
    try:
        page = context.new_page()
        page.goto(lan.base)
        dialog = page.get_by_role("dialog", name="Zugang erforderlich")
        expect(dialog).to_be_visible()
        expect(dialog).to_contain_text("QR-Code")
        expect(page.get_by_role("contentinfo")).to_contain_text("Kein Zugang")
        assert all(c["name"] != "mmy_access" for c in context.cookies())
    finally:
        context.close()


def test_token_link_sets_cookie_and_drops_the_token(browser: Browser, lan: Lan) -> None:
    context = browser.new_context(locale="de-DE")
    try:
        page = context.new_page()
        page.goto(f"{lan.base}/?token={lan.token}")
        # 303 to the same address without the token: it does not stay in the history.
        expect(page).to_have_url(f"{lan.base}/")
        expect(page.get_by_role("contentinfo")).to_contain_text("Backend bereit")
        expect(page.get_by_role("dialog", name="Zugang erforderlich")).to_have_count(0)

        cookie = next(c for c in context.cookies() if c["name"] == "mmy_access")
        assert cookie["httpOnly"] is True
        assert cookie["sameSite"] == "Strict"
        assert cookie["path"] == "/"
        assert cookie["secure"] is False  # plain HTTP
        assert cookie["expires"] > time.time() + 29 * 24 * 3600

        # A reload needs no token any more.
        page.reload()
        expect(page.get_by_role("contentinfo")).to_contain_text("Backend bereit")
    finally:
        context.close()


def test_wrong_token_sets_no_cookie(browser: Browser, lan: Lan) -> None:
    context = browser.new_context(locale="de-DE")
    try:
        page = context.new_page()
        page.goto(f"{lan.base}/?token=falsch")
        expect(page).to_have_url(f"{lan.base}/")
        expect(page.get_by_role("dialog", name="Zugang erforderlich")).to_be_visible()
        assert all(c["name"] != "mmy_access" for c in context.cookies())
    finally:
        context.close()


def test_manifest_and_icons_are_reachable_without_token(lan: Lan) -> None:
    with urllib.request.urlopen(f"{lan.base}/manifest.webmanifest", timeout=5) as response:
        assert response.status == 200
        manifest = json.loads(response.read())
    assert manifest["name"] == "moviemakerY2K"
    assert manifest["display"] == "standalone"
    for icon in manifest["icons"]:
        with urllib.request.urlopen(f"{lan.base}{icon['src']}", timeout=5) as response:
            assert response.status == 200
            assert response.headers["content-type"].startswith(icon["type"])
    # The API stays closed.
    with pytest.raises(urllib.error.HTTPError) as error:
        urllib.request.urlopen(f"{lan.base}/api/project", timeout=5)
    assert error.value.code == 401
    assert json.loads(error.value.read())["detail"]["code"] == "auth.required"
