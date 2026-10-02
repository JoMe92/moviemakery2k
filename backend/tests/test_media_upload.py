"""POST /api/media: Import, Prüfung, Grenzen, EXIF und Index (TASK-API-002)."""

import io
import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from mmy_backend import media
from mmy_backend.config import Settings
from mmy_backend.main import create_app
from mmy_backend.media import MediaStore, sanitize_filename

FileTuple = tuple[str, tuple[str, bytes, str]]


def _image_bytes(fmt: str, size: tuple[int, int], mode: str = "RGB", **save: Any) -> bytes:
    color: Any = (200, 30, 30, 128) if mode == "RGBA" else (200, 30, 30)
    buf = io.BytesIO()
    Image.new(mode, size, color).save(buf, fmt, **save)
    return buf.getvalue()


def _file(name: str, data: bytes, content_type: str = "image/jpeg") -> FileTuple:
    return ("files", (name, data, content_type))


def _upload(client: TestClient, files: list[FileTuple]) -> Any:
    res = client.post("/api/media", files=files)
    assert res.status_code == 200, res.text
    return res.json()["items"]


def _files_under(root: Path) -> set[Path]:
    return {p for p in root.rglob("*") if p.is_file()}


def test_jpeg_png_webp_are_imported_with_dims_and_files(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        items = _upload(
            client,
            [
                _file("a.jpg", _image_bytes("JPEG", (300, 200))),
                _file("b.png", _image_bytes("PNG", (64, 48), mode="RGBA"), "image/png"),
                _file("c.webp", _image_bytes("WEBP", (2400, 1200)), "image/webp"),
            ],
        )

    assert [r["ok"] for r in items] == [True, True, True]
    assert [r["filename"] for r in items] == ["a.jpg", "b.png", "c.webp"]
    dims = [(r["item"]["width"], r["item"]["height"]) for r in items]
    assert dims == [(300, 200), (64, 48), (2400, 1200)]

    for result, ext in zip(items, ["jpg", "png", "webp"], strict=True):
        item = result["item"]
        assert set(item) == {
            "id",
            "filename",
            "width",
            "height",
            "createdAt",
            "thumbnailUrl",
            "previewUrl",
        }
        assert item["thumbnailUrl"] == f"/api/media/{item['id']}/thumbnail"
        assert item["previewUrl"] == f"/api/media/{item['id']}/preview"
        item_dir = settings.data_dir / "media" / item["id"]
        assert sorted(p.name for p in item_dir.iterdir()) == sorted(
            [f"original.{ext}", "preview.jpg", "thumb.jpg"]
        )
        with Image.open(item_dir / "thumb.jpg") as thumb:
            assert thumb.format == "JPEG"
            assert thumb.width <= 160 and thumb.height <= 120
        with Image.open(item_dir / "preview.jpg") as preview:
            assert preview.format == "JPEG"
            assert max(preview.size) <= 1920

    # Original bleibt unverändert, Vorschau ist auf 1920 verkleinert.
    webp_dir = settings.data_dir / "media" / items[2]["item"]["id"]
    with Image.open(webp_dir / "original.webp") as original:
        assert original.size == (2400, 1200)
    with Image.open(webp_dir / "preview.jpg") as preview:
        assert preview.size == (1920, 960)
    # Transparenz liegt in den JPEG-Ableitungen auf Schwarz.
    png_dir = settings.data_dir / "media" / items[1]["item"]["id"]
    with Image.open(png_dir / "preview.jpg") as preview:
        r, g, b = preview.convert("RGB").getpixel((10, 10))  # type: ignore[misc]
        assert r < 130 and g < 40 and b < 40

    index = json.loads((settings.data_dir / "media.json").read_text(encoding="utf-8"))
    assert [entry["id"] for entry in index] == [r["item"]["id"] for r in items]


def test_text_file_named_jpg_is_unsupported_but_others_import(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        items = _upload(
            client,
            [
                _file("ok-1.jpg", _image_bytes("JPEG", (10, 10))),
                _file("fake.jpg", b"Das ist kein Bild, nur Text.\n" * 10),
                _file("ok-2.png", _image_bytes("PNG", (10, 10)), "image/png"),
            ],
        )

    assert [r["ok"] for r in items] == [True, False, True]
    failure = items[1]
    assert failure == {
        "filename": "fake.jpg",
        "ok": False,
        "error": "media.unsupportedType",
        "errorParams": {},
        "message": "Not a supported image (JPEG, PNG and WebP are allowed).",
    }
    assert len([p for p in (settings.data_dir / "media").iterdir()]) == 2


def test_other_image_format_is_unsupported(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        items = _upload(client, [_file("x.jpg", _image_bytes("GIF", (10, 10)))])
    assert items[0]["ok"] is False
    assert items[0]["error"] == "media.unsupportedType"


def test_file_over_25_mb_is_too_large_and_nothing_stored(settings: Settings) -> None:
    big = _image_bytes("PNG", (10, 10)) + b"\0" * (media.MAX_FILE_BYTES + 1)
    with TestClient(create_app(settings)) as client:
        items = _upload(client, [_file("big.png", big, "image/png")])

    assert items == [
        {
            "filename": "big.png",
            "ok": False,
            "error": "media.tooLarge",
            "errorParams": {"maxMegabytes": 25},
            "message": "The file is too large (at most 25 MB).",
        }
    ]
    assert _files_under(settings.data_dir) == set()


def test_too_many_pixels_is_rejected(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(media, "MAX_PIXELS", 100 * 100)
    with TestClient(create_app(settings)) as client:
        items = _upload(
            client,
            [
                _file("huge.jpg", _image_bytes("JPEG", (101, 100))),
                _file("fits.jpg", _image_bytes("JPEG", (100, 100))),
            ],
        )
    assert [r["ok"] for r in items] == [False, True]
    assert items[0]["error"] == "media.tooManyPixels"
    assert items[0]["errorParams"] == {"maxMegapixels": 40}
    assert items[0]["message"] == "The image has too many pixels (at most 40 megapixels)."


def test_decompression_bomb_is_too_many_pixels(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 10)
    with TestClient(create_app(settings)) as client:
        items = _upload(client, [_file("bomb.png", _image_bytes("PNG", (20, 20)), "image/png")])
    assert items[0]["error"] == "media.tooManyPixels"


def test_path_in_filename_is_display_only(settings: Settings, tmp_path: Path) -> None:
    before = _files_under(tmp_path)
    with TestClient(create_app(settings)) as client:
        items = _upload(
            client, [_file("../../etc/passwd.png", _image_bytes("PNG", (10, 10)), "image/png")]
        )

    assert items[0]["ok"] is True
    assert items[0]["filename"] == "passwd.png"
    assert items[0]["item"]["filename"] == "passwd.png"
    new_files = _files_under(tmp_path) - before
    assert new_files
    data_dir = settings.data_dir.resolve()
    for path in new_files:
        assert path.resolve().is_relative_to(data_dir)
        assert "passwd" not in path.name


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("../../etc/passwd.png", "passwd.png"),
        ("C:\\Users\\x\\bild.jpg", "bild.jpg"),
        ("a\x00b\nc.jpg", "abc.jpg"),
        ("..", "bild"),
        ("", "bild"),
        (None, "bild"),
        ("x" * 300 + ".jpg", "x" * 255),
    ],
)
def test_sanitize_filename(raw: str | None, expected: str) -> None:
    assert sanitize_filename(raw) == expected


def test_exif_rotated_photo_is_reported_and_derived_portrait(settings: Settings) -> None:
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation: um 90° im Uhrzeigersinn drehen
    data = _image_bytes("JPEG", (40, 20), exif=exif.tobytes())

    with TestClient(create_app(settings)) as client:
        items = _upload(client, [_file("hochkant.jpg", data)])

    item = items[0]["item"]
    assert (item["width"], item["height"]) == (20, 40)
    item_dir = settings.data_dir / "media" / item["id"]
    for name in ("thumb.jpg", "preview.jpg"):
        with Image.open(item_dir / name) as derived:
            assert derived.width < derived.height
    with Image.open(item_dir / "original.jpg") as original:
        assert original.size == (40, 20)  # Original bleibt erhalten


def test_more_than_50_files_rejects_request(settings: Settings) -> None:
    png = _image_bytes("PNG", (2, 2))
    files = [_file(f"{i}.png", png, "image/png") for i in range(media.MAX_FILES_PER_REQUEST + 1)]
    with TestClient(create_app(settings)) as client:
        res = client.post("/api/media", files=files)
    assert res.status_code == 413
    assert res.json()["detail"] == {
        "code": "media.tooManyFiles",
        "params": {"max": 50, "count": 51},
        "message": "Too many files: at most 50 per import (51 sent).",
    }
    assert not (settings.data_dir / "media").exists()


def test_exactly_50_files_are_accepted(settings: Settings) -> None:
    png = _image_bytes("PNG", (2, 2))
    files = [_file(f"{i}.png", png, "image/png") for i in range(media.MAX_FILES_PER_REQUEST)]
    with TestClient(create_app(settings)) as client:
        items = _upload(client, files)
    assert len(items) == 50 and all(r["ok"] for r in items)


def test_index_persists_across_app_instances(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        first = _upload(client, [_file("1.jpg", _image_bytes("JPEG", (10, 10)))])
        second = _upload(client, [_file("2.jpg", _image_bytes("JPEG", (10, 10)))])

    store = MediaStore(settings.data_dir)
    listed = store.list()
    assert [m.id for m in listed] == [first[0]["item"]["id"], second[0]["item"]["id"]]
    assert [m.filename for m in listed] == ["1.jpg", "2.jpg"]
    assert not list(settings.data_dir.glob(".media-*"))  # keine Temp-Reste

    with TestClient(create_app(settings)) as client:
        _upload(client, [_file("3.jpg", _image_bytes("JPEG", (10, 10)))])
    assert [m.filename for m in MediaStore(settings.data_dir).list()] == [
        "1.jpg",
        "2.jpg",
        "3.jpg",
    ]


def test_openapi_describes_upload_result_union(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        spec = client.get("/openapi.json").json()
    schemas = spec["components"]["schemas"]
    assert schemas["MediaUploadSuccess"]["properties"]["ok"]["const"] is True
    assert schemas["MediaUploadFailure"]["properties"]["ok"]["const"] is False
    assert "ok" in schemas["MediaUploadSuccess"]["required"]
    assert "ok" in schemas["MediaUploadFailure"]["required"]
    failure = schemas["MediaUploadFailure"]
    assert failure["properties"]["error"]["type"] == "string"
    assert {"error", "message"} <= set(failure["required"])
    assert "errorParams" in failure["properties"]
    assert "createdAt" in schemas["MediaItem"]["properties"]
