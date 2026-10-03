"""Checks the shared shaders (invocation: `pixi run check-shaders`).

1. Every transition/effect program (prelude + <transitions|effects>/<id>.glsl +
   epilogue), the vertex shader and the title-vertex/title-fragment program
   (for titles and credits, independent of the transition contract) compile
   with glslangValidator as GLSL ES 3.00.
2. Catalog and shaders match: every shader file exists, every catalog
   parameter is declared as `uniform float <name>;` and vice versa.

Exit code != 0 on any error.
"""

import json
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHADERS = ROOT / "packages" / "shaders"
UNIFORM_RE = re.compile(r"^\s*uniform\s+float\s+(\w+)\s*;", re.M)


@dataclass(frozen=True)
class CatalogSpec:
    label: str
    catalog: Path
    entries_key: str
    shader_dir: Path
    prelude: Path
    epilogue: Path


CATALOGS = [
    CatalogSpec(
        label="transitions",
        catalog=ROOT / "packages" / "catalog" / "transitions.json",
        entries_key="transitions",
        shader_dir=SHADERS / "transitions",
        prelude=SHADERS / "prelude.glsl",
        epilogue=SHADERS / "epilogue.glsl",
    ),
    CatalogSpec(
        label="effects",
        catalog=ROOT / "packages" / "catalog" / "effects.json",
        entries_key="effects",
        shader_dir=SHADERS / "effects",
        prelude=SHADERS / "effect-prelude.glsl",
        epilogue=SHADERS / "effect-epilogue.glsl",
    ),
]


def validate(source: str, stage: str, label: str, tmp: Path) -> list[str]:
    path = tmp / f"{label}.{stage}"
    path.write_text(source, encoding="utf-8")
    res = subprocess.run(
        ["glslangValidator", "-S", stage, str(path)], capture_output=True, text=True
    )
    if res.returncode == 0:
        return []
    return [f"{label}: glslangValidator\n{(res.stdout + res.stderr).strip()}"]


def check_catalog(spec: CatalogSpec, tmp: Path) -> tuple[list[str], int]:
    prelude = spec.prelude.read_text(encoding="utf-8")
    epilogue = spec.epilogue.read_text(encoding="utf-8")
    entries = json.loads(spec.catalog.read_text(encoding="utf-8"))[spec.entries_key]
    problems: list[str] = []
    referenced: set[str] = set()

    for entry in entries:
        shader = spec.shader_dir / entry["shader"]
        referenced.add(shader.name)
        if not shader.is_file():
            problems.append(f"{entry['id']}: shader missing: {shader.relative_to(ROOT)}")
            continue
        body = shader.read_text(encoding="utf-8")
        declared = set(UNIFORM_RE.findall(body))
        expected = set(entry["params"])
        if declared != expected:
            problems.append(
                f"{entry['id']}: uniforms {sorted(declared)} do not match "
                f"catalog parameters {sorted(expected)}"
            )
        problems += validate(prelude + "\n" + body + "\n" + epilogue, "frag", entry["id"], tmp)

    for orphan in sorted(p.name for p in spec.shader_dir.glob("*.glsl")):
        if orphan not in referenced:
            problems.append(f"{orphan}: shader without catalog entry")

    return problems, len(entries)


def main() -> int:
    problems: list[str] = []

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        problems += validate(
            (SHADERS / "vertex.glsl").read_text(encoding="utf-8"), "vert", "vertex", tmp
        )
        problems += validate(
            (SHADERS / "title-vertex.glsl").read_text(encoding="utf-8"),
            "vert",
            "title-vertex",
            tmp,
        )
        problems += validate(
            (SHADERS / "title-fragment.glsl").read_text(encoding="utf-8"),
            "frag",
            "title-fragment",
            tmp,
        )
        for spec in CATALOGS:
            catalog_problems, count = check_catalog(spec, tmp)
            problems += catalog_problems
            if not catalog_problems:
                print(f"OK  {count} {spec.label}")

    for problem in problems:
        print(f"ERROR {problem}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
