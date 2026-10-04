"""Access to the FFmpeg binaries. FFmpeg is used as a subprocess, never linked."""

import os
import re
import shutil
import subprocess
from functools import cache

_VERSION_RE = re.compile(r"ffmpeg version (?:n)?(\S+)")


def ffmpeg_binary() -> str | None:
    """Path to ffmpeg; can be overridden via MMY_FFMPEG."""
    return os.environ.get("MMY_FFMPEG") or shutil.which("ffmpeg")


def ffprobe_binary() -> str | None:
    """Path to ffprobe; can be overridden via MMY_FFPROBE."""
    return os.environ.get("MMY_FFPROBE") or shutil.which("ffprobe")


def parse_version(banner: str) -> str | None:
    match = _VERSION_RE.search(banner)
    return match.group(1) if match else None


@cache
def ffmpeg_version() -> str | None:
    binary = ffmpeg_binary()
    if binary is None:
        return None
    try:
        out = subprocess.run(
            [binary, "-hide_banner", "-version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    return parse_version(out)
