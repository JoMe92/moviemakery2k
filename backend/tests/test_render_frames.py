"""Frame renderer of the export (TASK-RENDER-003, design.md D4).

The boundary golden frames follow `e2e/test_golden_frames.py`: transition from
pure red to pure blue at 640x480; at `progress` 0 every pixel is exactly red,
at 1 exactly blue, at 0.4 different from both (except `pixelate`, which shows
no midpoint on solid-colour images; a test pattern checks its blocks instead).
The GL tests always run on Linux (EGL/llvmpipe from Pixi).
"""

import uuid
from collections.abc import Iterator
from itertools import pairwise
from pathlib import Path

import moderngl
import pytest
from conftest import requires_gl
from PIL import Image

from mmy_backend.catalog import load_catalog
from mmy_backend.config import DEFAULT_SHADERS_DIR, REPO_ROOT
from mmy_backend.media import MediaStore
from mmy_backend.render.frames import FrameRenderer, flip_rows, letterbox, preview_loader
from mmy_backend.render.geometry import Rect, contain_rect
from mmy_backend.render.shaders import ShaderLibrary, ShaderSources
from mmy_backend.render.timeline import (
    EmptyFrame,
    StillFrame,
    Timeline,
    TimelineSlide,
    TransitionFrame,
    TransitionIn,
    build_timeline,
    frame_count,
)

CATALOG = load_catalog(REPO_ROOT / "packages" / "catalog" / "transitions.json")
IDS = [t.id for t in CATALOG.transitions]
W, H = 640, 480
RED = (255, 0, 0, 255)
BLUE = (0, 0, 255, 255)
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)


def solid(color: tuple[int, int, int], size: tuple[int, int] = (64, 48)) -> Image.Image:
    return Image.new("RGB", size, color)


def pattern(size: tuple[int, int]) -> Image.Image:
    """Asymmetric pattern: every column/row differs so that flips are noticed."""
    w, h = size
    image = Image.new("RGB", size)
    image.putdata(
        [((x * 7) % 256, (y * 5) % 256, (x * y) % 256) for y in range(h) for x in range(w)]
    )
    return image


def pixels(data: bytes) -> list[tuple[int, ...]]:
    return [tuple(data[i : i + 4]) for i in range(0, len(data), 4)]


def count(data: bytes, color: tuple[int, int, int, int]) -> int:
    return sum(1 for p in pixels(data) if p == color)


def at(data: bytes, x: int, y: int, width: int = W) -> tuple[int, ...]:
    """Pixel (x, y), origin top left."""
    i = (y * width + x) * 4
    return tuple(data[i : i + 4])


def timeline_for(*media_ids: str, transition: str = "fade") -> Timeline:
    return build_timeline(
        [
            TimelineSlide(
                id=f"s{i}",
                media_id=media_id,
                duration=2.0,
                transition_in=TransitionIn(transition, 1.0) if i > 0 else None,
            )
            for i, media_id in enumerate(media_ids)
        ]
    )


class DictLoader:
    """ImageLoader backed by a dict; counts the loads."""

    def __init__(self, images: dict[str, Image.Image]) -> None:
        self.images = images
        self.loads: list[str] = []

    def __call__(self, media_id: str) -> Image.Image | None:
        self.loads.append(media_id)
        return self.images.get(media_id)


@pytest.fixture(scope="module")
def library(ctx: moderngl.Context) -> Iterator[ShaderLibrary]:
    lib = ShaderLibrary(ctx, ShaderSources(DEFAULT_SHADERS_DIR))
    try:
        yield lib
    finally:
        lib.release()


@pytest.fixture
def red_blue(ctx: moderngl.Context, library: ShaderLibrary) -> Iterator[FrameRenderer]:
    loader = DictLoader({"red": solid((255, 0, 0)), "blue": solid((0, 0, 255))})
    with FrameRenderer(ctx, library, W, H, loader) as renderer:
        yield renderer


# --- Geometry and pixel helpers (without GL) -----------------------------------


@pytest.mark.parametrize(
    ("args", "expected"),
    [
        # Vectors from apps/web/src/render/geometry.test.ts
        ((300, 600, 640, 480), Rect(200, 0, 240, 480)),
        ((1920, 1080, 640, 480), Rect(0, 60, 640, 360)),
        ((1600, 1200, 640, 480), Rect(0, 0, 640, 480)),
        ((3, 7, 1280, 960), Rect((1280 - 411) // 2, 0, 411, 960)),
        ((0, 10, 640, 480), Rect(0, 0, 0, 0)),
        # Math.round: 2.5 → 3 (Python round would give 2)
        ((5, 4, 100, 2), Rect(48, 0, 3, 2)),
        ((100, 200, 640, 480), Rect(200, 0, 240, 480)),
    ],
)
def test_contain_rect_matches_geometry_ts(args: tuple[int, int, int, int], expected: Rect) -> None:
    assert contain_rect(*args) == expected


def test_letterbox_puts_portrait_between_black_bars() -> None:
    data = letterbox(solid((255, 255, 255), (100, 200)), W, H).tobytes()
    assert len(data) == W * H * 4
    for y in (0, H // 2, H - 1):
        assert at(data, 199, y) == BLACK
        assert at(data, 200, y) == WHITE
        assert at(data, 439, y) == WHITE
        assert at(data, 440, y) == BLACK


def test_flip_rows() -> None:
    data = bytes(range(4)) + bytes(range(4, 8)) + bytes(range(8, 12))
    assert flip_rows(data, 1, 3) == bytes(range(8, 12)) + bytes(range(4, 8)) + bytes(range(4))


def test_preview_loader_reads_media_preview(tmp_path: Path) -> None:
    store = MediaStore(tmp_path / "data")
    media_id = uuid.uuid4().hex
    store.item_dir(media_id).mkdir(parents=True)
    solid((10, 200, 30), (40, 30)).save(store.item_dir(media_id) / "preview.jpg", "JPEG")
    load = preview_loader(store)

    image = load(media_id)
    assert image is not None
    assert (image.mode, image.size) == ("RGB", (40, 30))
    assert load(uuid.uuid4().hex) is None  # missing
    assert load("../etc") is None  # invalid ID


# --- Golden frames (GL) ---------------------------------------------------------


@requires_gl
@pytest.mark.parametrize("transition_id", IDS)
def test_progress_0_is_exactly_the_from_frame(red_blue: FrameRenderer, transition_id: str) -> None:
    timeline = timeline_for("red", "blue", transition=transition_id)
    data = red_blue.render(TransitionFrame(0, 1, transition_id, 0.0), timeline, CATALOG)
    assert len(data) == W * H * 4
    assert count(data, RED) == W * H


@requires_gl
@pytest.mark.parametrize("transition_id", IDS)
def test_progress_1_is_exactly_the_to_frame(red_blue: FrameRenderer, transition_id: str) -> None:
    timeline = timeline_for("red", "blue", transition=transition_id)
    data = red_blue.render(TransitionFrame(0, 1, transition_id, 1.0), timeline, CATALOG)
    assert count(data, BLUE) == W * H


@requires_gl
@pytest.mark.parametrize("transition_id", [i for i in IDS if i != "pixelate"])
def test_midpoint_differs_from_both_ends(red_blue: FrameRenderer, transition_id: str) -> None:
    timeline = timeline_for("red", "blue", transition=transition_id)
    data = red_blue.render(TransitionFrame(0, 1, transition_id, 0.4), timeline, CATALOG)
    assert count(data, RED) < W * H
    assert count(data, BLUE) < W * H


@requires_gl
def test_pixelate_midpoint_builds_coarse_blocks(
    ctx: moderngl.Context, library: ShaderLibrary
) -> None:
    loader = DictLoader({"p": pattern((300, 600)), "blue": solid((0, 0, 255))})
    timeline = timeline_for("p", "blue", transition="pixelate")
    with FrameRenderer(ctx, library, W, H, loader) as renderer:
        sharp = renderer.render(StillFrame(0), timeline, CATALOG)
        coarse = renderer.render(TransitionFrame(0, 1, "pixelate", 0.45), timeline, CATALOG)

    def runs(data: bytes) -> int:
        row = pixels(data)[(H // 2) * W : (H // 2 + 1) * W]
        return 1 + sum(1 for a, b in pairwise(row) if a != b)

    assert coarse != sharp
    assert runs(coarse) < runs(sharp)
    assert runs(coarse) <= W // 40 + 2


@requires_gl
def test_wipe_right_and_circle_orientation(red_blue: FrameRenderer) -> None:
    # Same samples as e2e: origin top left after flipping.
    timeline = timeline_for("red", "blue")
    wipe = red_blue.render(TransitionFrame(0, 1, "wipe-right", 0.5), timeline, CATALOG)
    assert at(wipe, int(0.02 * (W - 1)), H // 2) == BLUE
    assert at(wipe, int(0.98 * (W - 1)), H // 2) == RED
    circle = red_blue.render(TransitionFrame(0, 1, "circle", 0.3), timeline, CATALOG)
    assert at(circle, W // 2, H // 2) == BLUE
    assert at(circle, int(0.01 * (W - 1)), int(0.01 * (H - 1))) == RED


@requires_gl
def test_portrait_still_has_black_bars(ctx: moderngl.Context, library: ShaderLibrary) -> None:
    loader = DictLoader({"tall": solid((255, 255, 255), (100, 200)), "blue": solid((0, 0, 255))})
    timeline = timeline_for("tall", "blue")
    with FrameRenderer(ctx, library, W, H, loader) as renderer:
        still = renderer.render(StillFrame(0), timeline, CATALOG)
        # Via GL (fade at progress 0) the result must be the same.
        drawn = renderer.render(TransitionFrame(0, 1, "fade", 0.0), timeline, CATALOG)
    for data in (still, drawn):
        for y in (0, H // 2, H - 1):
            assert at(data, 0, y) == BLACK
            assert at(data, 199, y) == BLACK
            assert at(data, 200, y) == WHITE
            assert at(data, 439, y) == WHITE
            assert at(data, 440, y) == BLACK
            assert at(data, W - 1, y) == BLACK
        assert count(data, WHITE) == 240 * H
        assert count(data, BLACK) == W * H - 240 * H


@requires_gl
def test_gl_path_matches_still_pixels_without_flip(
    ctx: moderngl.Context, library: ShaderLibrary
) -> None:
    # Asymmetric image: texture origin bottom left + flipping on read-back
    # yield exactly the fitted image, top left first.
    loader = DictLoader({"p": pattern((200, 100)), "q": pattern((90, 120))})
    timeline = timeline_for("p", "q")
    with FrameRenderer(ctx, library, W, H, loader) as renderer:
        assert renderer.render(TransitionFrame(0, 1, "fade", 0.0), timeline, CATALOG) == (
            renderer.render(StillFrame(0), timeline, CATALOG)
        )
        assert renderer.render(TransitionFrame(0, 1, "fade", 1.0), timeline, CATALOG) == (
            renderer.render(StillFrame(1), timeline, CATALOG)
        )


@requires_gl
def test_empty_frame_is_opaque_black(red_blue: FrameRenderer) -> None:
    data = red_blue.render(EmptyFrame(), build_timeline([]), CATALOG)
    assert data == bytes(BLACK) * (W * H)


@requires_gl
def test_missing_images_mirror_preview_canvas(
    ctx: moderngl.Context, library: ShaderLibrary
) -> None:
    loader = DictLoader({"red": solid((255, 0, 0))})
    with FrameRenderer(ctx, library, W, H, loader) as renderer:
        one = renderer.render(
            TransitionFrame(0, 1, "fade", 0.5), timeline_for("red", "gone"), CATALOG
        )
        none = renderer.render(
            TransitionFrame(0, 1, "fade", 0.5), timeline_for("gone", "lost"), CATALOG
        )
        still = renderer.render(StillFrame(0), timeline_for("gone"), CATALOG)
    assert count(one, RED) == W * H
    assert none == still == bytes(BLACK) * (W * H)


@requires_gl
def test_unknown_transition_uses_fade(red_blue: FrameRenderer) -> None:
    timeline = timeline_for("red", "blue", transition="no-such-transition")
    data = red_blue.render(TransitionFrame(0, 1, "no-such-transition", 0.5), timeline, CATALOG)
    (r, g, b, a), *rest = set(pixels(data))
    assert not rest  # uniform mix
    assert abs(r - 127.5) <= 1 and g == 0 and abs(b - 127.5) <= 1 and a == 255


@requires_gl
def test_iter_frames_covers_timeline_with_two_images(
    ctx: moderngl.Context, library: ShaderLibrary
) -> None:
    colors = {"a": (255, 0, 0), "b": (0, 255, 0), "c": (0, 0, 255), "d": (255, 255, 0)}
    loader = DictLoader({k: solid(v) for k, v in colors.items()})
    slides = [
        TimelineSlide("s0", "a", 1.0, None),
        TimelineSlide("s1", "b", 1.0, TransitionIn("dissolve", 0.5)),
        TimelineSlide("s2", "c", 1.0, TransitionIn("circle", 0.5)),
        TimelineSlide("s3", "a", 1.0, None),  # hard cut, image again
        TimelineSlide("s4", "d", 1.0, TransitionIn("unknown", 0.5)),
    ]
    timeline = build_timeline(slides)
    fps = 10
    width, height = 64, 48
    with FrameRenderer(ctx, library, width, height, loader) as renderer:
        frames = list(renderer.iter_frames(timeline, fps, CATALOG))
        assert len(renderer.cached_media_ids) <= 2
        assert renderer.peak_textures <= 2
        assert renderer.live_textures <= 2

    assert [n for n, _ in frames] == list(range(frame_count(timeline.duration, fps)))
    assert len(frames) == 35  # 5 x 1 s - 3 x 0.5 s transition = 3.5 s at 10 fps
    assert all(len(data) == width * height * 4 for _, data in frames)
    first, last = frames[0][1], frames[-1][1]
    assert set(pixels(first)) == {(255, 0, 0, 255)}
    assert set(pixels(last)) == {(255, 255, 0, 255)}
    # Every image is loaded at most once per appearance, not per frame.
    assert loader.loads == ["a", "b", "c", "a", "d"]
