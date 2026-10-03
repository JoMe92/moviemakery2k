"""LAN mode `scripts/serve_lan.py` (add-mobile-delivery design.md D2, D9; TASK-INFRA-016).

Never starts a server: `main` gets a fake `run`.
"""

import dataclasses
import importlib.util
import io
import stat
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

from mmy_backend.config import REPO_ROOT, Settings


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "serve_lan", REPO_ROOT / "scripts" / "serve_lan.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["serve_lan"] = module
    spec.loader.exec_module(module)
    return module


serve_lan = _load()

IP_OUTPUT = """\
1: lo    inet 127.0.0.1/8 scope host lo\\       valid_lft forever preferred_lft forever
2: eth0    inet 192.168.178.46/24 brd 192.168.178.255 scope global dynamic eth0\\
4: tailscale0    inet 100.86.79.27/32 scope global tailscale0\\       valid_lft forever
"""


@pytest.fixture
def built(settings: Settings) -> Settings:
    settings.web_dist.mkdir(parents=True, exist_ok=True)
    (settings.web_dist / "index.html").write_text("<!doctype html>")
    return settings


class Run:
    def __init__(self) -> None:
        self.configs: list[Any] = []

    def __call__(self, config: Any) -> None:
        self.configs.append(config)


def start(
    settings: Settings, *argv: str, addresses: list[str] | None = None
) -> tuple[int, Run, str, str]:
    run, out, err = Run(), io.StringIO(), io.StringIO()
    code = serve_lan.main(
        list(argv),
        settings=settings,
        run=run,
        addresses=lambda: addresses or ["192.168.178.46", "100.86.79.27"],
        out=out,
        err=err,
    )
    return code, run, out.getvalue(), err.getvalue()


def mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


# --- Token file -------------------------------------------------------------------


def test_token_is_created_with_owner_only_permissions(tmp_path: Path) -> None:
    path = tmp_path / "data" / "lan-token"
    token = serve_lan.load_or_create_token(path)
    assert len(token) >= 43  # 32 bytes URL-safe Base64 = 256 bit
    assert path.read_text().strip() == token
    assert mode(path) == 0o600


def test_token_is_reused(tmp_path: Path) -> None:
    path = tmp_path / "lan-token"
    first = serve_lan.load_or_create_token(path)
    assert serve_lan.load_or_create_token(path) == first


def test_rotate_creates_new_token(tmp_path: Path) -> None:
    path = tmp_path / "lan-token"
    first = serve_lan.load_or_create_token(path)
    second = serve_lan.load_or_create_token(path, rotate=True)
    assert second != first
    assert path.read_text().strip() == second
    assert mode(path) == 0o600


def test_reuse_tightens_permissions_and_empty_file_is_replaced(tmp_path: Path) -> None:
    path = tmp_path / "lan-token"
    path.write_text("kept\n")
    path.chmod(0o644)
    assert serve_lan.load_or_create_token(path) == "kept"
    assert mode(path) == 0o600
    path.write_text("")
    assert serve_lan.load_or_create_token(path)


def test_start_uses_token_from_data_dir(built: Settings) -> None:
    code, run, _, _ = start(built)
    assert code == 0
    token = (built.data_dir / "lan-token").read_text().strip()
    assert run.configs[0].token == token
    _, again, _, _ = start(built)
    assert again.configs[0].token == token
    _, rotated, _, _ = start(built, "--rotate-token")
    assert rotated.configs[0].token != token


# --- Options and output -----------------------------------------------------------


def test_http_defaults_and_output(built: Settings) -> None:
    code, run, out, _ = start(built)
    assert code == 0
    config = run.configs[0]
    assert (config.host, config.port, config.https, config.behind_proxy) == (
        "0.0.0.0",
        8080,
        False,
        False,
    )
    token = config.token
    assert f"http://192.168.178.46:8080/?token={token}" in out
    assert f"http://100.86.79.27:8080/?token={token}" in out
    assert serve_lan.NO_HTTPS_WARNING in out
    assert serve_lan.LINK_WARNING in out
    assert f"QR code: http://192.168.178.46:8080/?token={token}" in out
    assert "█" in out or "▀" in out or "▄" in out  # QR code as Unicode blocks


def test_https_with_cert(built: Settings, tmp_path: Path) -> None:
    cert, key = tmp_path / "lan.pem", tmp_path / "lan-key.pem"
    cert.write_text("cert")
    key.write_text("key")
    code, run, out, _ = start(built, "--cert", str(cert), "--key", str(key))
    assert code == 0
    config = run.configs[0]
    assert (config.port, config.cert, config.key, config.https) == (8443, cert, key, True)
    assert f"https://192.168.178.46:8443/?token={config.token}" in out
    assert serve_lan.NO_HTTPS_WARNING not in out
    assert serve_lan.LINK_WARNING in out


def test_qr_host_is_first(built: Settings) -> None:
    _, run, out, _ = start(built, "--qr-host", "100.86.79.27")
    assert f"QR code: http://100.86.79.27:8080/?token={run.configs[0].token}" in out


def test_port_from_option_and_env(built: Settings) -> None:
    _, run, _, _ = start(built, "--port", "9000")
    assert run.configs[0].port == 9000
    args = serve_lan.parse_args([])
    assert serve_lan.build_config(args, built, {"MMY_LAN_PORT": "9100"}).port == 9100
    with pytest.raises(serve_lan.LanError, match="MMY_LAN_PORT"):
        serve_lan.build_config(args, built, {"MMY_LAN_PORT": "x"})


def test_behind_proxy(built: Settings) -> None:
    _, run, out, _ = start(built, "--behind-proxy", "--qr-host", "pi.tail1234.ts.net")
    config = run.configs[0]
    assert (config.host, config.port, config.behind_proxy) == ("127.0.0.1", 8080, True)
    assert f"QR code: https://pi.tail1234.ts.net/?token={config.token}" in out
    assert f"http://127.0.0.1:8080/?token={config.token}" in out
    assert "192.168.178.46" not in out
    assert serve_lan.NO_HTTPS_WARNING not in out


def test_access_url_omits_default_port_and_quotes_token() -> None:
    assert serve_lan.access_url("https", "h", None, "a+b") == "https://h/?token=a%2Bb"
    assert serve_lan.access_url("http", "h", 80, "t") == "http://h/?token=t"


def test_parse_ipv4_skips_loopback() -> None:
    assert serve_lan.parse_ipv4(IP_OUTPUT) == ["192.168.178.46", "100.86.79.27"]
    assert serve_lan.parse_ipv4("inet 999.1.1.1 inet 0.0.0.0") == []


# --- Aborts without starting a server -----------------------------------------------


def test_missing_cert_file_aborts(built: Settings, tmp_path: Path) -> None:
    key = tmp_path / "k.pem"
    key.write_text("key")
    missing = tmp_path / "fehlt.pem"
    code, run, out, err = start(built, "--cert", str(missing), "--key", str(key))
    assert code != 0
    assert str(missing) in err
    assert run.configs == []
    assert out == ""
    assert not (built.data_dir / "lan-token").exists()


def test_missing_key_file_aborts(built: Settings, tmp_path: Path) -> None:
    cert = tmp_path / "c.pem"
    cert.write_text("cert")
    code, run, _, err = start(built, "--cert", str(cert), "--key", str(tmp_path / "nokey.pem"))
    assert code != 0 and "nokey.pem" in err and run.configs == []


def test_cert_without_key_aborts(built: Settings, tmp_path: Path) -> None:
    cert = tmp_path / "c.pem"
    cert.write_text("cert")
    code, run, _, err = start(built, "--cert", str(cert))
    assert code != 0 and "--key" in err and run.configs == []


def test_unbuilt_web_app_aborts(settings: Settings) -> None:
    code, run, _, err = start(dataclasses.replace(settings))
    assert code != 0 and "pixi run build" in err and run.configs == []
