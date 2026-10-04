"""Measure the export runtime (invocation: `pixi run bench-export`; TASK-RENDER-004).

Project: 12 images of 5 s each, transitions taken in turn from the catalog at 1.25 s,
input 12 photo-like JPEG previews (1920x1280 or portrait 1080x1920). Per profile
there is one render-only pass (without FFmpeg) and one full export
(render + encode, `export_movie`). Output: seconds, frames/s and
real-time factor.

Options: `--profile high|small` (repeatable), `--keep DIR` keeps the MP4 files.
"""

import argparse
import os
import platform
import tempfile
import time
from pathlib import Path

from mmy_backend.catalog import load_catalog
from mmy_backend.config import DEFAULT_SHADERS_DIR, REPO_ROOT
from mmy_backend.render.context import create_render_context
from mmy_backend.render.encode import ExportProfile, export_movie
from mmy_backend.render.frames import FrameRenderer
from mmy_backend.render.shaders import ShaderLibrary, ShaderSources
from mmy_backend.render.timeline import TimelineSlide, TransitionIn, build_timeline
from PIL import Image, ImageDraw

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
    parser.add_argument("--keep", type=Path, help="Directory for the MP4 files")
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

        print(f"Machine: {platform.machine()}, {os.cpu_count()} CPUs, {platform.platform()}")
        print(
            f"Project: {SLIDES} images x {SLIDE_SECONDS:g} s, "
            f"transitions {TRANSITION_SECONDS:g} s, video duration {timeline.duration:.2f} s"
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
                f"{frames} frames | render only {render_s:.2f} s ({frames / render_s:.0f} fps) | "
                f"export total {export_s:.2f} s ({frames / export_s:.0f} fps, "
                f"{timeline.duration / export_s:.1f}x real time) | {size_mb:.1f} MB"
            )


if __name__ == "__main__":
    main()
