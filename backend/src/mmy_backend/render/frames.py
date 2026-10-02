"""Frame-Renderer des Exports (design.md D4): Zeitmodell-Frame → RGBA-Bytes.

Spiegelt das sichtbare Ergebnis von `apps/web/src/render/Renderer.ts` und
`PreviewCanvas.tsx`:

- Jedes Vorschaubild (`media/<id>/preview.jpg`) wird mit dem ganzzahligen
  `containRect` auf eine schwarze, deckende Fläche in Ausgabegröße eingepasst
  (wie das Canvas2D-Letterboxing im Browser) und so als Textur hochgeladen,
  dass ihr Ursprung unten links liegt (`UNPACK_FLIP_Y_WEBGL`).
- Standbild: Der Browser zeichnet die Textur mit dem Fade-Programm bei
  `progress` 0, also texelgenau das eingepasste Bild. Der Export liefert genau
  diese Pixel ohne Shader (design.md D4: „Standbilder ohne Shader“).
- Übergang: Shader des Katalogeintrags (Rückfall `fade`) mit dessen
  Parametern; fehlt eines der beiden Bilder, wird das andere als Standbild
  gezeigt, fehlen beide, Schwarz - wie `PreviewCanvas`.
- Leeres Projekt: deckendes Schwarz (`drawEmpty`).
- Ausgabe: RGBA, `width * height * 4` Bytes, oberste Zeile zuerst (beim
  Auslesen vertikal gespiegelt).
- Höchstens zwei Bilder (und damit Bildtexturen) gleichzeitig: LRU nach
  Medien-ID; die Ausgabegröße ist je Renderer fest.
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
"""Lädt das Vorschaubild zu einer Medien-ID; None, wenn es fehlt oder unlesbar ist."""

MAX_CACHED_IMAGES = 2
"""Aktuelles und nächstes Bild eines Übergangs."""

PREVIEW_FILE = "preview.jpg"


def preview_loader(media: MediaStore) -> ImageLoader:
    """ImageLoader für `media/<id>/preview.jpg` (EXIF bereits beim Import normalisiert)."""

    def load(media_id: str) -> Image.Image | None:
        try:
            path = media.item_dir(media_id) / PREVIEW_FILE
        except ValueError:
            logger.warning("Ungültige Medien-ID %r; Bild bleibt schwarz.", media_id)
            return None
        try:
            with Image.open(path) as image:
                return image.convert("RGB")
        except (OSError, Image.DecompressionBombError) as exc:
            logger.warning("Vorschaubild %s nicht lesbar (%s); Bild bleibt schwarz.", path, exc)
            return None

    return load


def letterbox(image: Image.Image, width: int, height: int) -> Image.Image:
    """Bild per ganzzahligem containRect mittig auf deckendes Schwarz (RGBA, oben links)."""
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 255))
    rect = contain_rect(image.width, image.height, width, height)
    if rect.width > 0 and rect.height > 0:
        rgb = image if image.mode == "RGB" else image.convert("RGB")
        if rgb.size != (rect.width, rect.height):
            rgb = rgb.resize((rect.width, rect.height), Image.Resampling.LANCZOS)
        canvas.paste(rgb, (rect.x, rect.y))
    return canvas


def flip_rows(data: bytes, width: int, height: int) -> bytes:
    """Zeilenreihenfolge umkehren (GL: unterste Zeile zuerst ↔ Bild: oberste zuerst)."""
    stride = width * 4
    view = memoryview(data)
    return b"".join(view[row * stride : (row + 1) * stride] for row in range(height - 1, -1, -1))


@dataclass(eq=False)
class _SlideImage:
    media_id: str
    canvas: Image.Image | None
    """Eingepasstes Bild in Ausgabegröße; None, wenn das Vorschaubild fehlt."""
    pixels: bytes | None = None
    texture: moderngl.Texture | None = field(default=None)

    def release(self) -> None:
        if self.texture is not None:
            self.texture.release()
            self.texture = None


class FrameRenderer:
    """Zeichnet Frames des Zeitmodells in ein Offscreen-Framebuffer fester Größe."""

    def __init__(
        self,
        ctx: moderngl.Context,
        library: ShaderLibrary,
        width: int,
        height: int,
        load_image: ImageLoader,
    ) -> None:
        if width <= 0 or height <= 0:
            raise ValueError(f"Ungültige Ausgabegröße {width}x{height}")
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
        """Höchstzahl gleichzeitig lebender Bildtexturen (für Tests/Diagnose)."""

    # --- Bilder ---------------------------------------------------------------

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
            # Ursprung unten links wie UNPACK_FLIP_Y_WEBGL.
            flipped = entry.canvas.transpose(Image.Transpose.FLIP_TOP_BOTTOM).tobytes()
            texture = self.ctx.texture((self.width, self.height), 4, flipped)
            texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
            texture.repeat_x = False
            texture.repeat_y = False
            entry.texture = texture
            self.peak_textures = max(self.peak_textures, self.live_textures)
        return entry.texture

    # --- Zeichnen -------------------------------------------------------------

    def render(self, frame: Frame, timeline: Timeline, catalog: TransitionCatalog) -> bytes:
        """RGBA-Bytes (oberste Zeile zuerst) für einen Frame des Zeitmodells."""
        if isinstance(frame, EmptyFrame):
            return self._black
        if isinstance(frame, StillFrame):
            return self._pixels(self._image(timeline.slides[frame.slide_index].slide.media_id))

        source = self._image(timeline.slides[frame.from_index].slide.media_id)
        target = self._image(timeline.slides[frame.to_index].slide.media_id)
        if source.canvas is None or target.canvas is None:
            # Wie PreviewCanvas: nur ein Bild → Standbild, keins → Schwarz.
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
        """Alle Exportbilder `n` bei `t = n / fps`, `n < ceil(Dauer · fps)`."""
        for n in range(frame_count(timeline.duration, fps)):
            yield n, self.render(frame_at(timeline, frame_time(n, fps)), timeline, catalog)

    # --- Aufräumen ------------------------------------------------------------

    def release(self) -> None:
        """Gibt Texturen und Framebuffer frei (Kontext und ShaderLibrary bleiben beim Aufrufer)."""
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
