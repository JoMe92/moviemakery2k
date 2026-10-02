"""Prüft die geteilten Shader (Aufruf: `pixi run check-shaders`).

1. Jedes Übergangsprogramm (prelude + transitions/<id>.glsl + epilogue) und der
   Vertex-Shader kompilieren mit glslangValidator als GLSL ES 3.00.
2. Katalog und Shader passen zusammen: jede Shader-Datei existiert, jeder
   Katalog-Parameter ist als `uniform float <name>;` deklariert und umgekehrt.

Exit-Code != 0 bei jedem Fehler.
"""

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHADERS = ROOT / "packages" / "shaders"
CATALOG = ROOT / "packages" / "catalog" / "transitions.json"
UNIFORM_RE = re.compile(r"^\s*uniform\s+float\s+(\w+)\s*;", re.M)


def validate(source: str, stage: str, label: str, tmp: Path) -> list[str]:
    path = tmp / f"{label}.{stage}"
    path.write_text(source, encoding="utf-8")
    res = subprocess.run(
        ["glslangValidator", "-S", stage, str(path)], capture_output=True, text=True
    )
    if res.returncode == 0:
        return []
    return [f"{label}: glslangValidator\n{(res.stdout + res.stderr).strip()}"]


def main() -> int:
    prelude = (SHADERS / "prelude.glsl").read_text(encoding="utf-8")
    epilogue = (SHADERS / "epilogue.glsl").read_text(encoding="utf-8")
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))["transitions"]
    problems: list[str] = []
    referenced: set[str] = set()

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        problems += validate(
            (SHADERS / "vertex.glsl").read_text(encoding="utf-8"), "vert", "vertex", tmp
        )
        for entry in catalog:
            shader = SHADERS / "transitions" / entry["shader"]
            referenced.add(shader.name)
            if not shader.is_file():
                problems.append(f"{entry['id']}: Shader fehlt: {shader.relative_to(ROOT)}")
                continue
            body = shader.read_text(encoding="utf-8")
            declared = set(UNIFORM_RE.findall(body))
            expected = set(entry["params"])
            if declared != expected:
                problems.append(
                    f"{entry['id']}: Uniforms {sorted(declared)} passen nicht zu "
                    f"Katalog-Parametern {sorted(expected)}"
                )
            problems += validate(prelude + "\n" + body + "\n" + epilogue, "frag", entry["id"], tmp)

    for orphan in sorted(p.name for p in (SHADERS / "transitions").glob("*.glsl")):
        if orphan not in referenced:
            problems.append(f"{orphan}: Shader ohne Katalogeintrag")

    for problem in problems:
        print(f"FEHLER {problem}", file=sys.stderr)
    if not problems:
        print(f"OK  {len(catalog)} Übergänge + Vertex-Shader")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
