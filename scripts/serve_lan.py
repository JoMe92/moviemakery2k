"""LAN mode: built web app + API for phones in the home network (add-mobile-delivery D2).

    python scripts/serve_lan.py [--cert lan.pem --key lan-key.pem] [--port N]
                                [--host ADDR] [--behind-proxy] [--rotate-token]
                                [--qr-host HOST]

Invoked via the Pixi task `serve-lan` (depends on `build`). Binds uvicorn to all
interfaces (0.0.0.0) with HTTPS when `--cert`/`--key` are given (default port
8443), otherwise HTTP (default 8080); `--port` or MMY_LAN_PORT override the port.
`--behind-proxy` (for `tailscale serve`) binds to 127.0.0.1 and trusts
X-Forwarded-* only from there.

The access token lives in <MMY_DATA_DIR>/lan-token (mode 0600). It is created on
the first start, reused afterwards and replaced with `--rotate-token`, which
invalidates old links and cookies. The backend gets it as MMY_ACCESS_TOKEN.
"""

import argparse
import ipaddress
import os
import re
import secrets
import socket
import subprocess
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TextIO
from urllib.parse import quote

from mmy_backend.config import Settings

TOKEN_FILE = "lan-token"
TOKEN_BYTES = 32
"""256 bit, URL-safe Base64 (`secrets.token_urlsafe`)."""
HTTPS_PORT = 8443
HTTP_PORT = 8080
PROXY_ALLOWED_IPS = "127.0.0.1"

NO_HTTPS_WARNING = (
    "Warning: without HTTPS, 'Install as app' and 'Share…' are not available, and the "
    "token and your data travel unencrypted. See docs/mobile.md (Tailscale or mkcert)."
)
LINK_WARNING = (
    "Anyone with this link or QR code has access. "
    "Run with --rotate-token to invalidate old links and cookies."
)


class LanError(Exception):
    """A problem with the options; reported without starting the server."""


@dataclass(frozen=True, slots=True)
class LanConfig:
    host: str
    port: int
    token: str
    cert: Path | None
    key: Path | None
    behind_proxy: bool
    qr_host: str | None
    web_dist: Path

    @property
    def https(self) -> bool:
        return self.cert is not None


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="serve-lan", description=__doc__.splitlines()[0])
    parser.add_argument(
        "--host", help="address to bind (default 0.0.0.0, behind a proxy 127.0.0.1)"
    )
    parser.add_argument(
        "--port", type=int, help=f"port (MMY_LAN_PORT; default {HTTPS_PORT} / {HTTP_PORT})"
    )
    parser.add_argument("--cert", type=Path, help="TLS certificate (PEM), enables HTTPS")
    parser.add_argument("--key", type=Path, help="TLS private key (PEM)")
    parser.add_argument(
        "--behind-proxy",
        action="store_true",
        help="behind `tailscale serve`: bind to 127.0.0.1, trust X-Forwarded-* from there",
    )
    parser.add_argument("--rotate-token", action="store_true", help="create a new access token")
    parser.add_argument("--qr-host", help="host name or address shown as QR code")
    return parser.parse_args(list(argv))


def load_or_create_token(path: Path, rotate: bool = False) -> str:
    """The token from `path`; creates it (mode 0600) on first use or with `rotate`."""
    if not rotate and path.is_file():
        token = path.read_text(encoding="utf-8").strip()
        if token:
            path.chmod(0o600)
            return token
    path.parent.mkdir(parents=True, exist_ok=True)
    token = secrets.token_urlsafe(TOKEN_BYTES)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as file:
        file.write(token + "\n")
    path.chmod(0o600)  # also when the file existed with wider permissions
    return token


def _check_file(option: str, path: Path | None) -> None:
    if path is not None and not path.is_file():
        raise LanError(f"{option}: file not found: {path}")


def build_config(
    args: argparse.Namespace, settings: Settings, env: dict[str, str] | None = None
) -> LanConfig:
    """Validates the options and resolves token and port; starts nothing."""
    env = dict(os.environ) if env is None else env
    if (args.cert is None) != (args.key is None):
        raise LanError("--cert and --key must be given together")
    _check_file("--cert", args.cert)
    _check_file("--key", args.key)
    if not (settings.web_dist / "index.html").is_file():
        raise LanError(f"web app not built: {settings.web_dist} (run `pixi run build`)")
    port = args.port
    if port is None and env.get("MMY_LAN_PORT"):
        try:
            port = int(env["MMY_LAN_PORT"])
        except ValueError as error:
            raise LanError(f"MMY_LAN_PORT is not a port: {env['MMY_LAN_PORT']}") from error
    if port is None:
        port = HTTPS_PORT if args.cert else HTTP_PORT
    host = args.host or (PROXY_ALLOWED_IPS if args.behind_proxy else "0.0.0.0")
    token = load_or_create_token(settings.data_dir / TOKEN_FILE, rotate=args.rotate_token)
    return LanConfig(
        host=host,
        port=port,
        token=token,
        cert=args.cert,
        key=args.key,
        behind_proxy=args.behind_proxy,
        qr_host=args.qr_host,
        web_dist=settings.web_dist,
    )


_INET = re.compile(r"\binet (\d{1,3}(?:\.\d{1,3}){3})")


def parse_ipv4(output: str) -> list[str]:
    """IPv4 addresses from `ip -4 addr` or `ifconfig` output, without loopback."""
    found: list[str] = []
    for match in _INET.finditer(output):
        address = match.group(1)
        try:
            ip = ipaddress.IPv4Address(address)
        except ValueError:
            continue
        if not ip.is_loopback and not ip.is_unspecified and address not in found:
            found.append(address)
    return found


def ipv4_addresses() -> list[str]:
    """All non-loopback IPv4 addresses of the network interfaces (LAN, Tailscale)."""
    for command in (["ip", "-o", "-4", "addr", "show"], ["ifconfig"]):
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=5)
        except (OSError, subprocess.SubprocessError):
            continue
        addresses = parse_ipv4(result.stdout)
        if addresses:
            return addresses
    # Fallback (e.g. Windows): the address of the default route and of the host name.
    found: list[str] = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("192.0.2.1", 9))  # TEST-NET-1; nothing is sent
            found.append(probe.getsockname()[0])
    except OSError:
        pass
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
        found.extend(str(info[4][0]) for info in infos)
    except OSError:
        pass
    return parse_ipv4(" ".join(f"inet {a}" for a in found))


def access_url(scheme: str, host: str, port: int | None, token: str) -> str:
    default = {"http": 80, "https": 443}[scheme]
    authority = host if port in (None, default) else f"{host}:{port}"
    return f"{scheme}://{authority}/?token={quote(token, safe='')}"


def access_urls(config: LanConfig, addresses: Sequence[str]) -> list[str]:
    """Addresses with token; the first one is shown as QR code."""
    if config.behind_proxy:
        # The proxy (`tailscale serve`) terminates HTTPS on its own port 443.
        urls = [access_url("http", config.host, config.port, config.token)]
        if config.qr_host:
            urls.insert(0, access_url("https", config.qr_host, None, config.token))
        return urls
    scheme = "https" if config.https else "http"
    hosts = list(addresses)
    if config.host not in ("0.0.0.0", ""):
        hosts = [config.host]
    if config.qr_host:
        hosts = [config.qr_host, *(h for h in hosts if h != config.qr_host)]
    if not hosts:
        hosts = ["127.0.0.1"]
    return [access_url(scheme, host, config.port, config.token) for host in hosts]


def print_banner(config: LanConfig, urls: Sequence[str], out: TextIO) -> None:
    import segno

    out.write("moviemakerY2K LAN mode — open on your phone:\n")
    for url in urls:
        out.write(f"  {url}\n")
    out.write("\n")
    segno.make(urls[0], error="m").terminal(out=out, compact=True)
    out.write(f"\nQR code: {urls[0]}\n")
    if config.behind_proxy and not config.qr_host:
        out.write("Tip: --qr-host <device>.<tailnet>.ts.net shows the Tailscale address.\n")
    if not config.https and not config.behind_proxy:
        out.write(NO_HTTPS_WARNING + "\n")
    out.write(LINK_WARNING + "\n")
    out.flush()


def run_server(config: LanConfig) -> None:
    import uvicorn

    # mmy_backend.main reads the settings on import: set the token first.
    os.environ["MMY_ACCESS_TOKEN"] = config.token
    os.environ["MMY_WEB_DIST"] = str(config.web_dist)
    options: dict[str, Any] = {
        "host": config.host,
        "port": config.port,
        "proxy_headers": config.behind_proxy,
    }
    if config.behind_proxy:
        options["forwarded_allow_ips"] = PROXY_ALLOWED_IPS
    if config.cert and config.key:
        options["ssl_certfile"] = str(config.cert)
        options["ssl_keyfile"] = str(config.key)
    uvicorn.run("mmy_backend.main:app", **options)


def main(
    argv: Sequence[str],
    *,
    settings: Settings | None = None,
    run: Callable[[LanConfig], None] = run_server,
    addresses: Callable[[], list[str]] = ipv4_addresses,
    out: TextIO = sys.stdout,
    err: TextIO = sys.stderr,
) -> int:
    args = parse_args(argv)
    try:
        config = build_config(args, settings or Settings.from_env())
    except LanError as error:
        err.write(f"serve-lan: {error}\n")
        return 2
    print_banner(config, access_urls(config, addresses()), out)
    run(config)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
