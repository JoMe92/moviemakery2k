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
- At most two images (and thus image textures) at a time: LRU by media ID;
  the output size is fixed per renderer.
"""

import logging
from collections import OrderedDict
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass, field
from types import TracebackType
from typing import Self

import moderngl
from PIL import Image

from mmy_backend.catalog import TransitionCatalog
from mmy_backend.media import MediaStore
from mmy_backend.render.geometry import contain_rect
from mmy_backend.render.shaders import FROM_TEXTURE_UNIT, TO_TEXTURE_UNIT, ShaderLibrary
from mmy_backend.render.timeline import (
    EmptyFrame,
    Frame,
    StillFrame,
    Timeline,
    frame_at,
    frame_count,
    frame_time,
)

logger = logging.getLogger(__name__)

ImageLoader = Callable[[str], Image.Image | None]
"""Loads the preview image for a media ID; None if it is missing or unreadable."""

MAX_CACHED_IMAGES = 2
"""Current and next image of a transition."""

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


@dataclass(eq=False)
class _SlideImage:
    media_id: str
    canvas: Image.Image | None
    """Fitted image at output size; None if the preview image is missing."""
    pixels: bytes | None = None
    texture: moderngl.Texture | None = field(default=None)

    def release(self) -> None:
        if self.texture is not None:
            self.texture.release()
            self.texture = None


class FrameRenderer:
    """Draws frames of the time model into an offscreen framebuffer of fixed size."""

    def __init__(
        self,
        ctx: moderngl.Context,
        library: ShaderLibrary,
        width: int,
        height: int,
        load_image: ImageLoader,
    ) -> None:
        if width <= 0 or height <= 0:
            raise ValueError(f"Invalid output size {width}x{height}")
        self.ctx = ctx
        self.library = library
        self.width = width
        self.height = height
        self.load_image = load_image
        self._images: OrderedDict[str, _SlideImage] = OrderedDict()
        self._black = b"\x00\x00\x00\xff" * (width * height)
        self._color = ctx.renderbuffer((width, height), components=4)
        self._fbo = ctx.framebuffer(color_attachments=[self._color])
        self.peak_textures = 0
        """Maximum number of image textures alive at the same time (for tests/diagnostics)."""

    # --- Images ---------------------------------------------------------------

    @property
    def cached_media_ids(self) -> tuple[str, ...]:
        return tuple(self._images)

    @property
    def live_textures(self) -> int:
        return sum(1 for entry in self._images.values() if entry.texture is not None)

    def _image(self, media_id: str) -> _SlideImage:
        entry = self._images.get(media_id)
        if entry is not None:
            self._images.move_to_end(media_id)
            return entry
        while len(self._images) >= MAX_CACHED_IMAGES:
            _, oldest = self._images.popitem(last=False)
            oldest.release()
        source = self.load_image(media_id)
        canvas = None if source is None else letterbox(source, self.width, self.height)
        entry = _SlideImage(media_id=media_id, canvas=canvas)
        self._images[media_id] = entry
        return entry

    def _pixels(self, entry: _SlideImage) -> bytes:
        if entry.canvas is None:
            return self._black
        if entry.pixels is None:
            entry.pixels = entry.canvas.tobytes()
        return entry.pixels

    def _texture(self, entry: _SlideImage) -> moderngl.Texture:
        if entry.texture is None:
            assert entry.canvas is not None
            # Origin bottom left, like UNPACK_FLIP_Y_WEBGL.
            flipped = entry.canvas.transpose(Image.Transpose.FLIP_TOP_BOTTOM).tobytes()
            texture = self.ctx.texture((self.width, self.height), 4, flipped)
            texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
            texture.repeat_x = False
            texture.repeat_y = False
            entry.texture = texture
            self.peak_textures = max(self.peak_textures, self.live_textures)
        return entry.texture

    # --- Drawing --------------------------------------------------------------

    def render(self, frame: Frame, timeline: Timeline, catalog: TransitionCatalog) -> bytes:
        """RGBA bytes (top row first) for a frame of the time model."""
        if isinstance(frame, EmptyFrame):
            return self._black
        if isinstance(frame, StillFrame):
            return self._pixels(self._image(timeline.slides[frame.slide_index].slide.media_id))

        source = self._image(timeline.slides[frame.from_index].slide.media_id)
        target = self._image(timeline.slides[frame.to_index].slide.media_id)
        if source.canvas is None or target.canvas is None:
            # Like PreviewCanvas: only one image → still, none → black.
            return self._pixels(source if source.canvas is not None else target)
        params = next((t.params for t in catalog.transitions if t.id == frame.transition_id), {})
        return self._render_transition(source, target, frame.transition_id, frame.progress, params)

    def _render_transition(
        self,
        source: _SlideImage,
        target: _SlideImage,
        transition_id: str,
        progress: float,
        params: Mapping[str, float],
    ) -> bytes:
        program = self.library.get(transition_id)
        from_texture = self._texture(source)
        to_texture = self._texture(target)
        self._fbo.use()
        self._fbo.clear(0.0, 0.0, 0.0, 1.0)
        from_texture.use(location=FROM_TEXTURE_UNIT)
        to_texture.use(location=TO_TEXTURE_UNIT)
        program.set_uniforms(progress=progress, resolution=(self.width, self.height), params=params)
        program.draw()
        data = self._fbo.read(components=4, alignment=1)
        return flip_rows(data, self.width, self.height)

    def iter_frames(
        self, timeline: Timeline, fps: float, catalog: TransitionCatalog
    ) -> Iterator[tuple[int, bytes]]:
        """All export frames `n` at `t = n / fps`, `n < ceil(duration · fps)`."""
        for n in range(frame_count(timeline.duration, fps)):
            yield n, self.render(frame_at(timeline, frame_time(n, fps)), timeline, catalog)

    # --- Cleanup --------------------------------------------------------------

    def release(self) -> None:
        """Releases textures and framebuffer (context and ShaderLibrary stay with the caller)."""
        for entry in self._images.values():
            entry.release()
        self._images.clear()
        self._fbo.release()
        self._color.release()

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.release()
