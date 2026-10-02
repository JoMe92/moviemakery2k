"""Atomic writing of files in the data directory (design.md D7)."""

import os
import tempfile
from pathlib import Path


def write_bytes_atomic(path: Path, payload: bytes) -> None:
    """Writes `payload` to `path`: temp file in the same directory, fsync, os.replace.

    Readers see either the old or the new content, never half of it.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.stem}-", suffix=path.suffix, dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    except BaseException:
        Path(tmp_name).unlink(missing_ok=True)
        raise
