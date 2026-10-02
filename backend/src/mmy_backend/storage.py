"""Atomares Schreiben von Dateien im Datenverzeichnis (design.md D7)."""

import os
import tempfile
from pathlib import Path


def write_bytes_atomic(path: Path, payload: bytes) -> None:
    """Schreibt `payload` nach `path`: Temp-Datei im selben Verzeichnis, fsync, os.replace.

    Leser sehen entweder den alten oder den neuen Inhalt, nie einen halben.
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
