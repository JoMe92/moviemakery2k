"""Laufzeit des Exports messen (Aufruf: `pixi run bench-export`; TASK-RENDER-004).

Projekt: 12 Bilder à 5 s, Übergänge reihum aus dem Katalog mit 1,25 s, Eingabe
12 fotoähnliche JPEG-Vorschaubilder (1920x1280 bzw. Hochkant 1080x1920). Pro
Profil wird einmal nur gerendert (ohne FFmpeg) und einmal komplett exportiert
(Rendern + Kodieren, `export_movie`). Ausgabe: Sekunden, Bilder/s und
Echtzeitfaktor.

Optionen: `--profile high|small` (mehrfach), `--keep DIR` behält die MP4-Dateien.
"""

import argparse
import os
import platform
import tempfile
import time
from pathlib import Path

from PIL import Image, ImageDraw

from mmy_backend.catalog import load_catalog
from mmy_backend.config import DEFAULT_SHADERS_DIR, REPO_ROOT
from mmy_backend.render.context import create_render_context
from mmy_backend.render.encode import ExportProfile, export_movie
from mmy_backend.render.frames import FrameRenderer
from mmy_backend.render.shaders import ShaderLibrary, ShaderSources
from mmy_backend.render.timeline import TimelineSlide, TransitionIn, build_timeline

SLIDES = 12
SLIDE_SECONDS = 5.0
TRANSITION_SECONDS = 1.25


def make_previews(directory: Path) -> None:
    for i in range(SLIDES):
        size = (1080, 1920) if i % 4 == 3 else (1920, 1280)
        image = Image.effect_mandelbrot(size, (-2.2 + i * 0.03, -1.2, 0.8, 1.2), 60 + i)
        rgb = Image.merge("RGB", (image, Image.linear_gradient("L").resize(size), image))
        draw = ImageDraw.Draw(rgb)
        draw.ellipse((size[0] // 4, size[1] // 4, size[0] // 2, size[1] // 2), fill=(200, 80, 40))
        rgb.save(directory / f"{i}.jpg", "JPEG", quality=90)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--profile", action="append", choices=[p.value for p in ExportProfile])
    parser.add_argument("--keep", type=Path, help="Verzeichnis für die MP4-Dateien")
    args = parser.parse_args()
    profiles = [ExportProfile(p) for p in args.profile or ["small", "high"]]

    catalog = load_catalog(REPO_ROOT / "packages" / "catalog" / "transitions.json")
    ids = [t.id for t in catalog.transitions]
    timeline = build_timeline(
        [
            TimelineSlide(
                f"s{i}",
                str(i),
                SLIDE_SECONDS,
                TransitionIn(ids[(i - 1) % len(ids)], TRANSITION_SECONDS) if i else None,
            )
            for i in range(SLIDES)
        ]
    )

    with tempfile.TemporaryDirectory(prefix="mmy-bench-") as tmp:
        work = Path(tmp)
        make_previews(work)

        def load(media_id: str) -> Image.Image:
            with Image.open(work / f"{media_id}.jpg") as image:
                return image.convert("RGB")

        print(f"Rechner: {platform.machine()}, {os.cpu_count()} CPUs, {platform.platform()}")
        print(
            f"Projekt: {SLIDES} Bilder x {SLIDE_SECONDS:g} s, Übergänge {TRANSITION_SECONDS:g} s, "
            f"Videodauer {timeline.duration:.2f} s"
        )
        for profile in profiles:
            spec = profile.spec
            ctx = create_render_context()
            try:
                with ctx:
                    renderer_name = ctx.info["GL_RENDERER"]
                    library = ShaderLibrary(ctx, ShaderSources(DEFAULT_SHADERS_DIR))
                    start = time.perf_counter()
                    with FrameRenderer(ctx, library, spec.width, spec.height, load) as renderer:
                        frames = sum(1 for _ in renderer.iter_frames(timeline, spec.fps, catalog))
                    render_s = time.perf_counter() - start
                    library.release()
            finally:
                ctx.release()

            out_dir = args.keep or work
            out_dir.mkdir(parents=True, exist_ok=True)
            out = out_dir / f"bench-{profile.value}.mp4"
            start = time.perf_counter()
            export_movie(timeline, catalog, profile, out, load)
            export_s = time.perf_counter() - start
            size_mb = out.stat().st_size / 1e6
            print(
                f"{profile.value:5} {spec.width}x{spec.height}@{spec.fps} ({renderer_name}): "
                f"{frames} Bilder | nur Rendern {render_s:.2f} s ({frames / render_s:.0f} B/s) | "
                f"Export gesamt {export_s:.2f} s ({frames / export_s:.0f} B/s, "
                f"{timeline.duration / export_s:.1f}x Echtzeit) | {size_mb:.1f} MB"
            )


if __name__ == "__main__":
    main()
