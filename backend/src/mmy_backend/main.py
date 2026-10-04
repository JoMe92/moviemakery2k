"""FastAPI app. `create_app` loads the transition and title catalogs
immediately: if either is invalid, importing `mmy_backend.main:app` (and
therefore uvicorn) already fails."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from mmy_backend.access import AccessTokenMiddleware
from mmy_backend.api import router
from mmy_backend.catalog import load_catalog
from mmy_backend.config import Settings
from mmy_backend.exports import ExportManager
from mmy_backend.media import MediaStore
from mmy_backend.project import ProjectStore
from mmy_backend.title_catalog import load_title_catalog


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    catalog = load_catalog(settings.catalog_file)
    title_catalog = load_title_catalog(settings.title_catalog_file)
    media = MediaStore(settings.data_dir)
    exports = ExportManager(settings.data_dir, media, catalog, settings.shaders_dir)

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

    app = FastAPI(title="moviemakerY2K", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.catalog = catalog
    app.state.title_catalog = title_catalog
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
