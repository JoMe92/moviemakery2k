"""Development server: backend (uvicorn) and/or web app (Vite).

    python scripts/dev.py            # both, Ctrl+C stops both
    python scripts/dev.py backend    # FastAPI only
    python scripts/dev.py web        # Vite only
    python scripts/dev.py demo       # built web app + API on one port

The API port comes from MMY_API_PORT (default 8000); Vite forwards /api there.
Invoked via the Pixi tasks `dev`, `dev-backend`, `dev-web`.
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
# Not part of `dev`: built web app + API from a single process (pixi run demo).
DEMO = [sys.executable, "-m", "uvicorn", "mmy_backend.main:app", "--port", PORT]


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
    if sys.argv[1:] == ["demo"]:
        print(f"moviemakerY2K demo: http://127.0.0.1:{PORT}/", flush=True)
        sys.exit(subprocess.call(DEMO))
    args = sys.argv[1:] or list(COMMANDS)
    unknown = [a for a in args if a not in COMMANDS]
    if unknown:
        sys.exit(f"unknown: {', '.join(unknown)} (allowed: {', '.join(COMMANDS)})")
    sys.exit(main(args))
