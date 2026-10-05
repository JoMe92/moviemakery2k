"""Frame renderer of the export (design.md D4): time-model frame → RGBA bytes.

Mirrors the visible result of `apps/web/src/render/Renderer.ts` and
`PreviewCanvas.tsx`:

- Every preview image (`media/<id>/preview.jpg`) is fitted with the integral
  `containRect` onto an opaque black area of the output size (like the Canvas2D
  letterboxing in the browser) and uploaded as a texture so that its origin
  lies bottom left (`UNPACK_FLIP_Y_WEBGL`).
- Still frame: the browser draws the texture with the fade program at
  `progress` 0, i.e. exactly the fitted image, texel for texel. The export
  delivers exactly these pixels without a shader (design.md D4: "stills
  without shaders").
- Transition: shader of the catalog entry (fallback `fade`) with its
  parameters; if one of the two images is missing, the other is shown as a
  still, if both are missing, black - like `PreviewCanvas`.
- Empty project: opaque black (`drawEmpty`).
- Output: RGBA, `width * height * 4` bytes, top row first (flipped vertically
  on read-back).
- At most two slides (and thus textures) at a time: LRU by slide ID; the
  output size is fixed per renderer.
- A video segment (add-timeline-editing design.md D6) decodes from a
  sequential FFmpeg subprocess opened once per appearance, seeked to the
  slide's own `trimIn` (plus however far into its own span the export already
  is, for a slide that starts mid-transition), decoding forward at the
  export's frame rate; each later frame of the same appearance just reads the
  next decoded frame, never re-seeking. Every decoded frame is letterboxed
  and textured exactly like an image, so `_render_transition` (the GLSL path)
  needs no video awareness at all.
"""

import contextlib
import logging
import subprocess
from collections import OrderedDict
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from types import TracebackType
from typing import IO, Self

import moderngl
from PIL import Image

from mmy_backend.catalog import EffectCatalog, TransitionCatalog
from mmy_backend.ffmpeg import ffmpeg_binary
from mmy_backend.media import MediaStore, VideoItem
from mmy_backend.project import Slide
from mmy_backend.render.effects import IMAGE_TEXTURE_UNIT, EffectLibrary
from mmy_backend.render.geometry import contain_rect
from mmy_backend.render.shaders import (
    FALLBACK_TRANSITION_ID,
    FROM_TEXTURE_UNIT,
    TITLE_TEXTURE_UNIT,
    TO_TEXTURE_UNIT,
    ShaderLibrary,
)
from mmy_backend.render.timeline import (
    EmptyFrame,
    Frame,
    StillFrame,
    Timeline,
    TimelineSlide,
    frame_at,
    frame_count,
    frame_time,
)

logger = logging.getLogger(__name__)

ImageLoader = Callable[[str], Image.Image | None]
"""Loads the preview image for a media ID; None if it is missing or unreadable."""


@dataclass(frozen=True, slots=True)
class VideoSource:
    """Where to decode a video medium from, and its (rotation-corrected) frame size."""

    path: Path
    width: int
    height: int


VideoLoader = Callable[[str], VideoSource | None]
"""Resolves a video medium ID to its original file; None if missing or not a video."""

MAX_CACHED_IMAGES = 2
"""Current and next slide of a transition."""

PREVIEW_FILE = "preview.jpg"


def preview_loader(media: MediaStore) -> ImageLoader:
    """ImageLoader for `media/<id>/preview.jpg` (EXIF already normalised on import)."""

    def load(media_id: str) -> Image.Image | None:
        try:
            path = media.item_dir(media_id) / PREVIEW_FILE
        except ValueError:
            logger.warning("Invalid media ID %r; the image stays black.", media_id)
            return None
        try:
            with Image.open(path) as image:
                return image.convert("RGB")
        except (OSError, Image.DecompressionBombError) as exc:
            logger.warning("Preview image %s not readable (%s); the image stays black.", path, exc)
            return None

    return load


def video_loader(media: MediaStore) -> VideoLoader:
    """VideoLoader for `media/<id>/original.*` (add-timeline-editing design.md D6)."""

    def load(media_id: str) -> VideoSource | None:
        item = media.get(media_id)
        if not isinstance(item, VideoItem):
            return None
        try:
            directory = media.item_dir(media_id)
        except ValueError:
            logger.warning("Invalid media ID %r; the video stays black.", media_id)
            return None
        original = next(iter(sorted(directory.glob("original.*"))), None)
        if original is None:
            logger.warning("Original video file for %s missing; the video stays black.", media_id)
            return None
        return VideoSource(path=original, width=item.width, height=item.height)

    return load


def letterbox(image: Image.Image, width: int, height: int) -> Image.Image:
    """Centre the image on opaque black via integral containRect (RGBA, origin top left)."""
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 255))
    rect = contain_rect(image.width, image.height, width, height)
    if rect.width > 0 and rect.height > 0:
        rgb = image if image.mode == "RGB" else image.convert("RGB")
        if rgb.size != (rect.width, rect.height):
            rgb = rgb.resize((rect.width, rect.height), Image.Resampling.LANCZOS)
        canvas.paste(rgb, (rect.x, rect.y))
    return canvas


def flip_rows(data: bytes, width: int, height: int) -> bytes:
    """Reverse the row order (GL: bottom row first ↔ image: top row first)."""
    stride = width * 4
    view = memoryview(data)
    return b"".join(view[row * stride : (row + 1) * stride] for row in range(height - 1, -1, -1))


def _read_exact(stream: IO[bytes], size: int) -> bytes | None:
    """Reads exactly `size` bytes, or None at EOF before a single byte of it."""
    chunks: list[bytes] = []
    remaining = size
    while remaining > 0:
        chunk = stream.read(remaining)
        if not chunk:
            return None
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


@dataclass(eq=False)
class _VideoStream:
    """A sequential FFmpeg decode subprocess for one appearance of a video slide."""

    process: subprocess.Popen[bytes]
    width: int
    height: int
    frame_size: int = field(init=False)

    def __post_init__(self) -> None:
        self.frame_size = self.width * self.height * 3

    def read_frame(self) -> Image.Image | None:
        """The next decoded frame, or None at EOF (the caller keeps the last one)."""
        assert self.process.stdout is not None
        data = _read_exact(self.process.stdout, self.frame_size)
        if data is None:
            return None
        return Image.frombuffer("RGB", (self.width, self.height), data, "raw", "RGB", 0, 1)

    def close(self) -> None:
        if self.process.poll() is None:
            self.process.kill()
        if self.process.stdout is not None:
            with contextlib.suppress(OSError):
                self.process.stdout.close()
        self.process.wait()


def _spawn_video_stream(source: VideoSource, start: float, fps: float) -> _VideoStream | None:
    """Opens FFmpeg once, seeked to `start` s, decoding forward at `fps` (design.md D6).

    Input seeking (`-ss` before `-i`) is accurate (FFmpeg decodes-and-discards from the
    preceding keyframe), so every later frame of this stream comes from the same
    process without ever seeking again.
    """
    binary = ffmpeg_binary()
    if binary is None:
        logger.warning("FFmpeg not available; %s stays black.", source.path)
        return None
    command = [
        binary,
        "-nostdin",
        "-hide_banner",
        "-v",
        "error",
        "-ss",
        f"{max(start, 0.0):.6f}",
        "-i",
        str(source.path),
        "-map",
        "0:v:0",
        "-vf",
        f"fps={fps}",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "pipe:1",
    ]
    try:
        process = subprocess.Popen(
            command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
        )
    except OSError as exc:
        logger.warning("FFmpeg could not start for %s (%s); it stays black.", source.path, exc)
        return None
    return _VideoStream(process=process, width=source.width, height=source.height)


def _cache_key(slide: TimelineSlide) -> str:
    """Key of one slide's cache entry: its own ID, so that two slides sharing a
    video medium (e.g. after a split) decode independently, plus the media ID,
    so an entry is never reused for different content when a renderer draws a
    timeline that happens to reuse slide IDs."""
    return f"{slide.id}\x00{slide.media_id}"


@dataclass(eq=False)
class _SlideImage:
    media_id: str | None
    """None for a title element, which refers to no medium."""
    canvas: Image.Image | None
    """Fitted current frame at output size; None if the source is missing or unreadable."""
    pixels: bytes | None = None
    texture: moderngl.Texture | None = field(default=None)
    video: _VideoStream | None = None
    """Set for a video slide's live appearance; advances `canvas` on every access."""
    dirty: bool = False
    """True when `canvas` changed since the texture was last uploaded (video only)."""

    def advance(self, width: int, height: int) -> None:
        """Pulls the next decoded frame of `video` into `canvas` (a no-op at EOF)."""
        assert self.video is not None
        frame = self.video.read_frame()
        if frame is not None:
            self.canvas = letterbox(frame, width, height)
            self.pixels = None
            self.dirty = True

    def release(self) -> None:
        if self.texture is not None:
            self.texture.release()
            self.texture = None
        if self.video is not None:
            self.video.close()
            self.video = None


class FrameRenderer:
    """Draws frames of the time model into an offscreen framebuffer of fixed size."""

    def __init__(
        self,
        ctx: moderngl.Context,
        library: ShaderLibrary,
        width: int,
        height: int,
        load_image: ImageLoader,
        *,
        load_video: VideoLoader | None = None,
        project_slides: Sequence[Slide] = (),
        effect_library: EffectLibrary | None = None,
        effects: EffectCatalog | None = None,
    ) -> None:
        if width <= 0 or height <= 0:
            raise ValueError(f"Invalid output size {width}x{height}")
        self.ctx = ctx
        self.library = library
        self.width = width
        self.height = height
        self.load_image = load_image
        self.load_video = load_video
        self.effect_library = effect_library
        self.effects = effects
        """Effect catalog and its compiled programs (add-effects-catalog design.md
        D2/D3). Without both, an element's `effectId` is ignored and the export
        renders exactly as before this change."""
        self.project_slides = project_slides
        """Original project slides, aligned 1:1 with `Timeline.slides` by index
        (add-timeline-editing design.md D6): tells `_entry` whether a timeline
        index is a video slide and, if so, its own `trimIn`. Empty (the
        default) means every slide is treated as an image, as before this
        change."""
        self._images: OrderedDict[str, _SlideImage] = OrderedDict()
        self._black = b"\x00\x00\x00\xff" * (width * height)
        self._color = ctx.renderbuffer((width, height), components=4)
        self._fbo = ctx.framebuffer(color_attachments=[self._color])
        # Two extra framebuffers for the effect pass (design.md D2), one per
        # slot (0 = from/still, 1 = to): a transition may need an effect on
        # both images at once, so one intermediate texture alone would let the
        # second pass overwrite the first result before the main pass reads it.
        # Textures (not renderbuffers), since the result feeds back in as a
        # texture input to the still/transition pass that follows.
        self._effect_textures = (ctx.texture((width, height), 4), ctx.texture((width, height), 4))
        self._effect_fbos = (
            ctx.framebuffer(color_attachments=[self._effect_textures[0]]),
            ctx.framebuffer(color_attachments=[self._effect_textures[1]]),
        )
        self.peak_textures = 0
        """Maximum number of image textures alive at the same time (for tests/diagnostics)."""

    # --- Images ---------------------------------------------------------------

    @property
    def cached_slide_ids(self) -> tuple[str, ...]:
        """Keys of the cached slides (at most `MAX_CACHED_IMAGES`), see `_cache_key`."""
        return tuple(self._images)

    @property
    def live_textures(self) -> int:
        return sum(1 for entry in self._images.values() if entry.texture is not None)

    def _entry(self, index: int, timeline: Timeline, time: float, fps: float) -> _SlideImage:
        """Cache entry for timeline slide `index`, keyed by its own slide ID so that
        two slides sharing one video medium (e.g. after a split) decode independently.

        A cache hit means this slide was already live on the previous call: for a
        video slide that pulls the next decoded frame (`time` is irrelevant then,
        the open subprocess is already positioned); for an image it just returns the
        unchanged entry. A miss loads the image, or opens a fresh decode subprocess
        seeked to this slide's own `trimIn` plus however far into its placed span
        `time` already is (add-timeline-editing design.md D5/D6 - the same formula
        as the preview's `videoScrubTime`).
        """
        placed = timeline.slides[index]
        media_id = placed.slide.media_id
        key = _cache_key(placed.slide)
        cached = self._images.get(key)
        if cached is not None:
            self._images.move_to_end(key)
            if cached.video is not None:
                cached.advance(self.width, self.height)
            return cached
        while len(self._images) >= MAX_CACHED_IMAGES:
            _, oldest = self._images.popitem(last=False)
            oldest.release()
        project_slide = self.project_slides[index] if index < len(self.project_slides) else None
        if media_id is None:
            # A title element (add-titles-and-credits design.md D5) has no medium:
            # its appearance comes from the title render path (`draw_title` and
            # friends below), which TASK-INFRA-023 wires into `render`. Until
            # then it stays a black frame rather than a missing-media warning.
            entry = _SlideImage(media_id=None, canvas=None)
        elif project_slide is not None and project_slide.kind == "video":
            entry = self._open_video(media_id, project_slide.trim_in, placed.start, time, fps)
        else:
            source = self.load_image(media_id)
            canvas = None if source is None else letterbox(source, self.width, self.height)
            entry = _SlideImage(media_id=media_id, canvas=canvas)
        self._images[key] = entry
        return entry

    def _open_video(
        self, media_id: str, trim_in: float, placed_start: float, time: float, fps: float
    ) -> _SlideImage:
        source = self.load_video(media_id) if self.load_video is not None else None
        stream = (
            _spawn_video_stream(source, trim_in + (time - placed_start), fps)
            if source is not None
            else None
        )
        entry = _SlideImage(media_id=media_id, canvas=None, video=stream)
        if stream is not None:
            entry.advance(self.width, self.height)
        return entry

    def _pixels(self, entry: _SlideImage) -> bytes:
        if entry.canvas is None:
            return self._black
        if entry.pixels is None:
            entry.pixels = entry.canvas.tobytes()
        return entry.pixels

    def _texture(self, entry: _SlideImage) -> moderngl.Texture:
        assert entry.canvas is not None
        # Origin bottom left, like UNPACK_FLIP_Y_WEBGL.
        if entry.texture is None:
            flipped = entry.canvas.transpose(Image.Transpose.FLIP_TOP_BOTTOM).tobytes()
            texture = self.ctx.texture((self.width, self.height), 4, flipped)
            texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
            texture.repeat_x = False
            texture.repeat_y = False
            entry.texture = texture
            entry.dirty = False
            self.peak_textures = max(self.peak_textures, self.live_textures)
        elif entry.dirty:
            flipped = entry.canvas.transpose(Image.Transpose.FLIP_TOP_BOTTOM).tobytes()
            entry.texture.write(flipped)
            entry.dirty = False
        return entry.texture

    # --- Effect pass (design.md D2) --------------------------------------------

    def _effect_of(self, index: int) -> tuple[str, Mapping[str, float]] | None:
        """Effect of the timeline element `index`: its catalog ID and the entry's
        fixed parameters, or None without an effect (or without a catalog)."""
        if self.effects is None or self.effect_library is None:
            return None
        slide = self.project_slides[index] if index < len(self.project_slides) else None
        # A title element carries no `effectId` (add-titles-and-credits design.md D5).
        effect_id = None if slide is None or slide.kind == "title" else slide.effect_id
        if not effect_id:
            return None
        params = next((e.params for e in self.effects.effects if e.id == effect_id), None)
        # An ID outside the catalog cannot reach a saved project (the API
        # rejects it), so a miss here means the catalog changed under us: skip.
        return None if params is None else (effect_id, params)

    def apply_effect(
        self,
        texture: moderngl.Texture,
        effect_id: str | None,
        library: EffectLibrary,
        params: Mapping[str, float] = {},
        slot: int = 0,
    ) -> moderngl.Texture:
        """Runs the effect pass ahead of the still/transition pass.

        Without an effect ID, or on a missing/broken shader, returns `texture`
        unchanged (no copy) — matches `Renderer.resolveEffect` in the browser.
        `slot` (0 = from/still, 1 = to) picks which intermediate texture is
        used, so a transition can apply different effects to both images at once.
        """
        if not effect_id:
            return texture
        program = library.get(effect_id)
        if program is None:
            return texture
        fbo = self._effect_fbos[slot]
        fbo.use()
        fbo.clear(0.0, 0.0, 0.0, 1.0)
        texture.use(location=IMAGE_TEXTURE_UNIT)
        program.set_uniforms(resolution=(self.width, self.height), params=params)
        program.draw()
        return self._effect_textures[slot]

    # --- Drawing --------------------------------------------------------------

    def render(
        self,
        frame: Frame,
        timeline: Timeline,
        catalog: TransitionCatalog,
        time: float = 0.0,
        fps: float = 30.0,
    ) -> bytes:
        """RGBA bytes (top row first) for a frame of the time model at `time` s.

        `time` and `fps` only matter for a video slide's first appearance: where
        to seek its decode subprocess into, and at what rate to decode forward
        (design.md D6, matched to `iter_frames`' own `fps` so every later frame
        of the same appearance lines up without re-seeking); still images
        ignore both.
        """
        if isinstance(frame, EmptyFrame):
            return self._black
        if isinstance(frame, StillFrame):
            entry = self._entry(frame.slide_index, timeline, time, fps)
            effect = self._effect_of(frame.slide_index)
            if effect is None or entry.canvas is None:
                # Stills without shaders (design.md D4) whenever no effect is set.
                return self._pixels(entry)
            # With an effect the still goes through GL as well: the effect pass
            # feeds the fade program at progress 0, which is the still case of
            # the preview (`drawStill`).
            return self._render_transition(
                entry, entry, FALLBACK_TRANSITION_ID, 0.0, {}, effect, effect
            )

        source = self._entry(frame.from_index, timeline, time, fps)
        target = self._entry(frame.to_index, timeline, time, fps)
        if source.canvas is None or target.canvas is None:
            # Like PreviewCanvas: only one image → still, none → black.
            present = source if source.canvas is not None else target
            index = frame.from_index if source.canvas is not None else frame.to_index
            effect = self._effect_of(index)
            if effect is None or present.canvas is None:
                return self._pixels(present)
            return self._render_transition(
                present, present, FALLBACK_TRANSITION_ID, 0.0, {}, effect, effect
            )
        params = next((t.params for t in catalog.transitions if t.id == frame.transition_id), {})
        return self._render_transition(
            source,
            target,
            frame.transition_id,
            frame.progress,
            params,
            self._effect_of(frame.from_index),
            self._effect_of(frame.to_index),
        )

    def _render_transition(
        self,
        source: _SlideImage,
        target: _SlideImage,
        transition_id: str,
        progress: float,
        params: Mapping[str, float],
        from_effect: tuple[str, Mapping[str, float]] | None = None,
        to_effect: tuple[str, Mapping[str, float]] | None = None,
    ) -> bytes:
        program = self.library.get(transition_id)
        from_texture = self._texture(source)
        to_texture = self._texture(target)
        # Effect pass before the still/transition pass (design.md D2); without an
        # effect `apply_effect` returns the texture unchanged, with no copy.
        if self.effect_library is not None:
            if from_effect is not None:
                from_texture = self.apply_effect(
                    from_texture, from_effect[0], self.effect_library, from_effect[1], slot=0
                )
            if to_effect is not None:
                to_texture = self.apply_effect(
                    to_texture, to_effect[0], self.effect_library, to_effect[1], slot=1
                )
        self._fbo.use()
        self._fbo.clear(0.0, 0.0, 0.0, 1.0)
        from_texture.use(location=FROM_TEXTURE_UNIT)
        to_texture.use(location=TO_TEXTURE_UNIT)
        program.set_uniforms(progress=progress, resolution=(self.width, self.height), params=params)
        program.draw()
        data = self._fbo.read(components=4, alignment=1)
        return flip_rows(data, self.width, self.height)

    # --- Titles (design.md D1-D3) ----------------------------------------------

    def _title_texture(self, image: Image.Image) -> moderngl.Texture:
        """Uploads a title/credits image at its own natural size (never
        letterboxed/fitted) - `draw_title`'s vertex transform positions and
        scales it instead. The caller releases the returned texture.
        """
        rgba = image if image.mode == "RGBA" else image.convert("RGBA")
        # Origin bottom left, like UNPACK_FLIP_Y_WEBGL.
        flipped = rgba.transpose(Image.Transpose.FLIP_TOP_BOTTOM).tobytes()
        texture = self.ctx.texture(rgba.size, 4, flipped)
        texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
        texture.repeat_x = False
        texture.repeat_y = False
        return texture

    def draw_title(
        self,
        image: Image.Image,
        *,
        translate: tuple[float, float] = (0.0, 0.0),
        scale: tuple[float, float] | float = 1.0,
        blend: bool,
    ) -> None:
        """Draws a title/credits texture into the currently bound framebuffer
        at `translate`/`scale` (design.md D3), either opaque (`blend=False`,
        a freestanding title element already fully covering the black
        background it was rasterised onto, design.md D1) or alpha-blended
        over whatever was drawn before it (`blend=True`, an overlay title,
        design.md D2). `gl.BLEND` is always left disabled afterwards.
        """
        scale_xy = (scale, scale) if isinstance(scale, int | float) else scale
        program = self.library.title_program()
        texture = self._title_texture(image)
        try:
            texture.use(location=TITLE_TEXTURE_UNIT)
            if blend:
                self.ctx.enable(moderngl.BLEND)
                self.ctx.blend_func = (moderngl.SRC_ALPHA, moderngl.ONE_MINUS_SRC_ALPHA)
            program.set_transform(translate, scale_xy)
            program.draw()
            if blend:
                self.ctx.disable(moderngl.BLEND)
        finally:
            texture.release()

    def render_title_standalone(
        self,
        image: Image.Image,
        *,
        translate: tuple[float, float] = (0.0, 0.0),
        scale: tuple[float, float] | float = 1.0,
    ) -> bytes:
        """A freestanding title element: opaque, on a cleared black frame."""
        self._fbo.use()
        self._fbo.clear(0.0, 0.0, 0.0, 1.0)
        self.draw_title(image, translate=translate, scale=scale, blend=False)
        return flip_rows(self._fbo.read(components=4, alignment=1), self.width, self.height)

    def render_title_overlay(
        self,
        base: Image.Image,
        title: Image.Image,
        *,
        translate: tuple[float, float] = (0.0, 0.0),
        scale: tuple[float, float] | float = 1.0,
    ) -> bytes:
        """An overlay title over an already-drawn still frame (design.md D2)."""
        canvas = letterbox(base, self.width, self.height)
        base_entry = _SlideImage(media_id="__title_overlay_base__", canvas=canvas)
        try:
            texture = self._texture(base_entry)
            self._fbo.use()
            self._fbo.clear(0.0, 0.0, 0.0, 1.0)
            texture.use(location=FROM_TEXTURE_UNIT)
            texture.use(location=TO_TEXTURE_UNIT)
            program = self.library.get(FALLBACK_TRANSITION_ID)
            program.set_uniforms(progress=0.0, resolution=(self.width, self.height), params={})
            program.draw()
            self.draw_title(title, translate=translate, scale=scale, blend=True)
            return flip_rows(self._fbo.read(components=4, alignment=1), self.width, self.height)
        finally:
            base_entry.release()

    def iter_frames(
        self, timeline: Timeline, fps: float, catalog: TransitionCatalog
    ) -> Iterator[tuple[int, bytes]]:
        """All export frames `n` at `t = n / fps`, `n < ceil(duration · fps)`."""
        for n in range(frame_count(timeline.duration, fps)):
            t = frame_time(n, fps)
            yield n, self.render(frame_at(timeline, t), timeline, catalog, t, fps)

    # --- Cleanup --------------------------------------------------------------

    def release(self) -> None:
        """Releases textures and framebuffer (context and ShaderLibrary stay with the caller)."""
        for entry in self._images.values():
            entry.release()
        self._images.clear()
        self._fbo.release()
        self._color.release()
        for fbo in self._effect_fbos:
            fbo.release()
        for texture in self._effect_textures:
            texture.release()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.release()
