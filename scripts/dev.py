"""Entwicklungsserver: Backend (uvicorn) und/oder Web-App (Vite).

    python scripts/dev.py            # beide, Strg+C beendet beide
    python scripts/dev.py backend    # nur FastAPI
    python scripts/dev.py web        # nur Vite

Der API-Port kommt aus MMY_API_PORT (Standard 8000); Vite leitet /api dorthin weiter.
Aufruf über die Pixi-Tasks `dev`, `dev-backend`, `dev-web`.
"""

import os
import signal
import subprocess
import sys
import time

PORT = os.environ.get("MMY_API_PORT", "8000")
COMMANDS = {
    "backend": [
        sys.executable, "-m", "uvicorn", "mmy_backend.main:app",
        "--reload", "--reload-dir", "backend/src", "--port", PORT,
    ],
    "web": ["pnpm", "--filter", "@mmy/web", "dev"],
}


def main(targets: list[str]) -> int:
    env = {**os.environ, "MMY_API_PORT": PORT}
    procs = [subprocess.Popen(COMMANDS[name], env=env) for name in targets]

    def stop(*_: object) -> None:
        for proc in procs:
            if proc.poll() is None:
                proc.terminate()

    signal.signal(signal.SIGTERM, stop)
    try:
        while all(proc.poll() is None for proc in procs):
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        stop()
        for proc in procs:
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
    return max((proc.returncode or 0) for proc in procs)


if __name__ == "__main__":
    args = sys.argv[1:] or list(COMMANDS)
    unknown = [a for a in args if a not in COMMANDS]
    if unknown:
        sys.exit(f"unbekannt: {', '.join(unknown)} (erlaubt: {', '.join(COMMANDS)})")
    sys.exit(main(args))
