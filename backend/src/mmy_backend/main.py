"""FastAPI app. `create_app` loads the transition, title, effect and AutoMovie
catalogs immediately: if one of them is invalid, importing
`mmy_backend.main:app` (and therefore uvicorn) already fails."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from mmy_backend.access import AccessTokenMiddleware
from mmy_backend.api import router
from mmy_backend.automovie_catalog import load_automovie_catalog
from mmy_backend.catalog import load_catalog, load_effect_catalog
from mmy_backend.config import Settings
from mmy_backend.exports import ExportManager
from mmy_backend.media import MediaStore
from mmy_backend.project import ProjectStore
from mmy_backend.title_catalog import load_title_catalog

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    catalog = load_catalog(settings.catalog_file)
    title_catalog = load_title_catalog(settings.title_catalog_file)
    effect_catalog = load_effect_catalog(settings.effect_catalog_file)
    # The bundled title font (add-titles-and-credits design.md D1) ships with
    # the repository; a project without titles works without it, so a missing
    # file is a warning rather than a refusal to start - the export then
    # renders a title as a black frame instead of failing mid-render.
    title_font_file = settings.title_font_file if settings.title_font_file.is_file() else None
    if title_font_file is None:
        logger.warning(
            "Title font %s is missing: titles and credits will export as black frames "
            "(set MMY_FONTS_DIR to the directory holding %s).",
            settings.title_font_file,
            settings.title_font_file.name,
        )
    # Last: its entries are references into the three catalogs above.
    automovie_catalog = load_automovie_catalog(
        settings.automovie_catalog_file, catalog, effect_catalog, title_catalog
    )
    media = MediaStore(settings.data_dir)
    exports = ExportManager(
        settings.data_dir,
        media,
        catalog,
        settings.shaders_dir,
        effect_catalog,
        titles=title_catalog,
        title_font_file=title_font_file,
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        # Load finished exports from the index; remove partial files and other remains.
        await asyncio.to_thread(exports.load_on_start)
        try:
            yield
        finally:
            # Cancel running exports; workers clean up their own partial files.
            await asyncio.to_thread(exports.shutdown)

    app = FastAPI(title="moviemakerY2K", version="0.2.1", lifespan=lifespan)
    app.state.settings = settings
    app.state.catalog = catalog
    app.state.title_catalog = title_catalog
    app.state.effect_catalog = effect_catalog
    app.state.automovie_catalog = automovie_catalog
    app.state.media = media
    app.state.project = ProjectStore(settings.data_dir)
    app.state.exports = exports
    app.include_router(router)
    # LAN mode (`pixi run serve-lan`): /api/ only with the access token.
    if settings.access_token:
        app.add_middleware(AccessTokenMiddleware, token=settings.access_token)
    # `pixi run demo`: serve the built web app under / (one process, one port).
    if (settings.web_dist / "index.html").is_file():
        app.mount("/", StaticFiles(directory=settings.web_dist, html=True), name="web")
    return app


app = create_app()
