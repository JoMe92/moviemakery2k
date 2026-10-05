"""Titles in the exported frames (TASK-INFRA-023, add-titles-and-credits
design.md D1-D4): `FrameRenderer.render` draws a freestanding title element
instead of a picture, an overlay title over the already-rendered frame
(stills and transitions alike), and the catalog's phase effects - the same
values the preview computes, since `mmy_backend.render.titles` is a 1:1 port
of `apps/web/src/titles/titleRender.ts`.
"""

import moderngl
import pytest
from conftest import CATALOG_DIR, requires_gl
from PIL import Image

from mmy_backend.catalog import TransitionCatalog, load_catalog
from mmy_backend.config import DEFAULT_FONTS_DIR, DEFAULT_SHADERS_DIR, TITLE_FONT_FILE
from mmy_backend.project import (
    ImageSlide,
    Project,
    TitleOverlay,
    TitleSlide,
    TransitionRef,
    VideoSlide,
)
from mmy_backend.render.frames import FrameRenderer
from mmy_backend.render.shaders import ShaderLibrary, ShaderSources
from mmy_backend.render.timeline import build_timeline, frame_at, timeline_slides_from_project
from mmy_backend.render.titles import (
    durations_of,
    phases_of,
    title_alpha_at,
    title_draw_at,
    title_lines,
)
from mmy_backend.title_catalog import Title, TitleCatalog, load_title_catalog

W, H = 160, 120
FONT_FILE = DEFAULT_FONTS_DIR / TITLE_FONT_FILE
WHITE = "#ffffff"


@pytest.fixture(scope="module")
def titles() -> TitleCatalog:
    return load_title_catalog(CATALOG_DIR / "titles.json")


@pytest.fixture(scope="module")
def transitions() -> TransitionCatalog:
    return load_catalog(CATALOG_DIR / "transitions.json")


def style(catalog: TitleCatalog, style_id: str) -> Title:
    entry = next((t for t in catalog.titles if t.id == style_id), None)
    assert entry is not None, f"no such catalog style: {style_id}"
    return entry


def title_slide(slide_id: str = "t1", **fields: object) -> TitleSlide:
    data: dict[str, object] = {
        "kind": "title",
        "id": slide_id,
        "lines": ["MMM"],
        "credit_entries": None,
        "style_id": "basic-title",
        "color": WHITE,
        "duration": 5.0,
        "transition_in": None,
    }
    data.update(fields)
    return TitleSlide.model_validate(data)


def image_slide(slide_id: str, media_id: str = "red", **fields: object) -> ImageSlide:
    data: dict[str, object] = {
        "kind": "image",
        "id": slide_id,
        "media_id": media_id,
        "duration": 5.0,
        "effect_id": None,
        "title": None,
        "transition_in": None,
    }
    data.update(fields)
    return ImageSlide.model_validate(data)


RED = Image.new("RGBA", (16, 12), (255, 0, 0, 255))


def load_red(media_id: str) -> Image.Image | None:
    return RED if media_id == "red" else None


@pytest.fixture(scope="module")
def library(ctx: moderngl.Context) -> ShaderLibrary:
    return ShaderLibrary(ctx, ShaderSources(DEFAULT_SHADERS_DIR))


def make_renderer(
    ctx: moderngl.Context,
    library: ShaderLibrary,
    slides: list[TitleSlide | ImageSlide | VideoSlide],
    titles: TitleCatalog,
) -> FrameRenderer:
    return FrameRenderer(
        ctx,
        library,
        W,
        H,
        load_red,
        project_slides=slides,
        titles=titles,
        title_font_file=FONT_FILE,
    )


def pixel(data: bytes, x: int, y: int) -> tuple[int, ...]:
    """Pixel (x, y), origin top left."""
    i = (y * W + x) * 4
    return tuple(data[i : i + 4])


def frame_of(
    renderer: FrameRenderer,
    slides: list[TitleSlide | ImageSlide | VideoSlide],
    transitions: TransitionCatalog,
    time: float,
) -> bytes:
    project = Project(
        schema_version=6,
        slides=list(slides),
        music=[],
        narration=[],
        clip_audio_balance=50,
    )
    timeline = build_timeline(timeline_slides_from_project(project))
    return renderer.render(frame_at(timeline, time), timeline, transitions, time)


def white_pixels(data: bytes) -> int:
    return sum(1 for i in range(0, len(data), 4) if data[i] > 200 and data[i + 1] > 200)


def red_pixels(data: bytes) -> int:
    return sum(
        1 for i in range(0, len(data), 4) if data[i] > 180 and data[i + 1] < 70 and data[i + 2] < 70
    )


# --- Pure Python: the phase values the preview also computes -------------------


def test_durations_give_entrance_and_exit_one_second_each() -> None:
    d = durations_of(5.0)
    assert (d.entrance_seconds, d.exit_seconds, d.total_seconds) == (1.0, 1.0, 5.0)


def test_a_short_title_splits_its_time_evenly() -> None:
    d = durations_of(1.0)
    assert (d.entrance_seconds, d.exit_seconds) == (0.5, 0.5)


def test_fade_entrance_ramps_up_and_fade_exit_ramps_down(titles: TitleCatalog) -> None:
    basic = style(titles, "basic-title")
    d = durations_of(5.0)
    assert title_alpha_at(basic, d, 0.0) == 0.0
    assert title_alpha_at(basic, d, 0.5) == pytest.approx(0.5)
    assert title_alpha_at(basic, d, 2.5) == 1.0
    assert title_alpha_at(basic, d, 4.5) == pytest.approx(0.5)
    assert title_alpha_at(basic, d, 5.0) == 0.0


def test_a_position_entrance_stays_fully_visible(titles: TitleCatalog) -> None:
    fly_in = style(titles, "fly-in")
    d = durations_of(5.0)
    assert title_alpha_at(fly_in, d, 0.5) == 1.0
    # Its exit is a fade.
    assert title_alpha_at(fly_in, d, 4.5) == pytest.approx(0.5)


def test_fly_in_moves_from_outside_the_frame_to_the_centre(titles: TitleCatalog) -> None:
    fly_in = style(titles, "fly-in")
    assert title_draw_at(fly_in, 5.0, 0.0, overlay=False).transform.translate.x == -1
    assert title_draw_at(fly_in, 5.0, 0.5, overlay=False).transform.translate.x == pytest.approx(
        -0.5
    )
    assert title_draw_at(fly_in, 5.0, 2.5, overlay=False).transform.translate.x == 0


def test_credits_scroll_runs_through_main(titles: TitleCatalog) -> None:
    scroll = style(titles, "scroll-up-stacked")
    assert title_draw_at(scroll, 10.0, 1.0, overlay=False).transform.translate.y == pytest.approx(
        -1
    )
    assert title_draw_at(scroll, 10.0, 5.0, overlay=False).transform.translate.y == pytest.approx(0)
    assert title_draw_at(scroll, 10.0, 8.9, overlay=False).transform.translate.y == pytest.approx(
        0.975
    )


def test_phases_hold_the_anchor_for_fade_and_static(titles: TitleCatalog) -> None:
    phases = phases_of(style(titles, "subtitle"))
    # Subtitle sits at the bottom; nothing moves it, so every phase holds it.
    assert (phases.entrance.start.translate.x, phases.entrance.start.translate.y) == (0.0, -0.7)
    assert (phases.main.end.translate.x, phases.main.end.translate.y) == (0.0, -0.7)


def test_title_lines_reads_whichever_field_carries_the_text() -> None:
    assert title_lines(title_slide()) == ["MMM"]
    credits = title_slide(lines=None, credit_entries=["A", "B"], style_id="scroll-up-stacked")
    assert title_lines(credits) == ["A", "B"]
    assert title_lines(TitleOverlay(lines=["Over"], style_id="subtitle", color=WHITE)) == ["Over"]


# --- Real GL: the exported frames ---------------------------------------------


@requires_gl
def test_a_title_element_renders_its_text_on_black(
    ctx: moderngl.Context,
    library: ShaderLibrary,
    titles: TitleCatalog,
    transitions: TransitionCatalog,
) -> None:
    slides: list[TitleSlide | ImageSlide | VideoSlide] = [title_slide()]
    with make_renderer(ctx, library, slides, titles) as renderer:
        # Mid-Main: fully visible, centred, nothing else in the frame.
        data = frame_of(renderer, slides, transitions, 2.5)
    assert len(data) == W * H * 4
    assert white_pixels(data) > 0, "the title text should be visible"
    assert red_pixels(data) == 0, "a title element shows no picture"
    assert pixel(data, 0, 0)[:3] == (0, 0, 0), "its background is black (design.md D1)"


@requires_gl
def test_a_fade_entrance_is_darker_at_its_start_than_mid_main(
    ctx: moderngl.Context,
    library: ShaderLibrary,
    titles: TitleCatalog,
    transitions: TransitionCatalog,
) -> None:
    """The catalog's `fade` phase effect reaches the exported frames."""
    slides: list[TitleSlide | ImageSlide | VideoSlide] = [title_slide()]
    with make_renderer(ctx, library, slides, titles) as renderer:
        early = frame_of(renderer, slides, transitions, 0.25)
        mid = frame_of(renderer, slides, transitions, 2.5)
    assert white_pixels(early) < white_pixels(mid), (
        "a quarter into the one-second fade the text must not be fully white yet"
    )


@requires_gl
def test_an_overlay_title_keeps_the_picture_behind_it(
    ctx: moderngl.Context,
    library: ShaderLibrary,
    titles: TitleCatalog,
    transitions: TransitionCatalog,
) -> None:
    overlay = TitleOverlay(lines=["MMM"], style_id="basic-title", color=WHITE)
    with_title: list[TitleSlide | ImageSlide | VideoSlide] = [image_slide("s1", title=overlay)]
    without: list[TitleSlide | ImageSlide | VideoSlide] = [image_slide("s1")]
    with make_renderer(ctx, library, without, titles) as renderer:
        plain = frame_of(renderer, without, transitions, 2.5)
    with make_renderer(ctx, library, with_title, titles) as renderer:
        data = frame_of(renderer, with_title, transitions, 2.5)
    assert red_pixels(plain) == W * H, "without a title the frame is the plain picture"
    assert red_pixels(data) > 0, "the picture stays visible under the overlay"
    assert white_pixels(data) > 0, "the overlay text is drawn on top"
    assert red_pixels(data) < red_pixels(plain), "the text covers part of the picture"


@requires_gl
def test_an_overlay_title_stays_visible_through_a_transition(
    ctx: moderngl.Context,
    library: ShaderLibrary,
    titles: TitleCatalog,
    transitions: TransitionCatalog,
) -> None:
    """Spec titles-and-credits "Overlay über einem Übergang": the text stays
    over the whole transition and follows its own phases while it runs - here
    the host element's exit fade, so it is present but no longer fully opaque.
    """
    overlay = TitleOverlay(lines=["MMM"], style_id="basic-title", color=WHITE)
    incoming = TransitionRef(transition_id="fade", duration=1.0)
    with_title: list[TitleSlide | ImageSlide | VideoSlide] = [
        image_slide("s1", title=overlay),
        image_slide("s2", transition_in=incoming),
    ]
    without: list[TitleSlide | ImageSlide | VideoSlide] = [
        image_slide("s1"),
        image_slide("s2", transition_in=incoming),
    ]
    timeline = build_timeline(
        timeline_slides_from_project(
            Project(
                schema_version=6,
                slides=with_title,
                music=[],
                narration=[],
                clip_audio_balance=50,
            )
        )
    )
    mid = timeline.slides[1].start + 0.5
    frame = frame_at(timeline, mid)
    assert type(frame).__name__ == "TransitionFrame"
    with make_renderer(ctx, library, without, titles) as renderer:
        plain = renderer.render(frame, timeline, transitions, mid)
    with make_renderer(ctx, library, with_title, titles) as renderer:
        data = renderer.render(frame, timeline, transitions, mid)
    assert red_pixels(plain) == W * H
    assert data != plain, "the overlay text must still be drawn mid-transition"
    assert red_pixels(data) < red_pixels(plain), "the text covers part of the frame"


@requires_gl
def test_a_credits_element_scrolls_its_list(
    ctx: moderngl.Context,
    library: ShaderLibrary,
    titles: TitleCatalog,
    transitions: TransitionCatalog,
) -> None:
    """A long list shows its first entries early and its last ones late."""
    entries = [f"Eintrag {i}" for i in range(1, 21)]
    credits = title_slide(
        lines=None,
        credit_entries=entries,
        style_id="scroll-up-stacked",
        duration=10.0,
    )
    slides: list[TitleSlide | ImageSlide | VideoSlide] = [credits]
    with make_renderer(ctx, library, slides, titles) as renderer:
        early = frame_of(renderer, slides, transitions, 1.5)
        late = frame_of(renderer, slides, transitions, 8.5)
    assert white_pixels(early) > 0 and white_pixels(late) > 0
    # The list moves: the visible rows are not the same ones.
    assert early != late, "the scroll must move the list between the two moments"


@requires_gl
def test_without_a_catalog_a_title_element_stays_black(
    ctx: moderngl.Context,
    library: ShaderLibrary,
    transitions: TransitionCatalog,
) -> None:
    """Without the catalog and font the export behaves as before this change."""
    slides: list[TitleSlide | ImageSlide | VideoSlide] = [title_slide()]
    with FrameRenderer(ctx, library, W, H, load_red, project_slides=slides) as renderer:
        data = frame_of(renderer, slides, transitions, 2.5)
    assert white_pixels(data) == 0
    assert set(data[0::4]) == {0}
