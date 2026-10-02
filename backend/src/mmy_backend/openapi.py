"""Writes the backend's OpenAPI document as JSON.

    python -m mmy_backend.openapi [target.json]

Basis for the web app's generated TypeScript types (`pixi run gen-api`).
The output is sorted stably so that CI detects differences via `git diff`.
"""

import json
import sys
from pathlib import Path

from mmy_backend.main import create_app


def render() -> str:
    return json.dumps(create_app().openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    text = render()
    if argv:
        target = Path(argv[0])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
