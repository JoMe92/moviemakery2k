"""FastAPI-App. `create_app` lädt den Übergangskatalog sofort: ist er ungültig,
bricht schon der Import von `mmy_backend.main:app` (und damit uvicorn) ab."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from mmy_backend.api import router
from mmy_backend.catalog import load_catalog
from mmy_backend.config import Settings
from mmy_backend.exports import ExportManager
from mmy_backend.media import MediaStore
from mmy_backend.project import ProjectStore


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    catalog = load_catalog(settings.catalog_file)
    media = MediaStore(settings.data_dir)
    exports = ExportManager(settings.data_dir, media, catalog, settings.shaders_dir)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        # Jobs überleben keinen Neustart: Teildateien und alte Exporte entfernen.
        await asyncio.to_thread(exports.cleanup_on_start)
        try:
            yield
        finally:
            # Laufende Exporte abbrechen; Worker räumen ihre Teildateien selbst auf.
            await asyncio.to_thread(exports.shutdown)

    app = FastAPI(title="moviemakerY2K", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.catalog = catalog
    app.state.media = media
    app.state.project = ProjectStore(settings.data_dir)
    app.state.exports = exports
    app.include_router(router)
    # `pixi run demo`: gebaute Web-App unter / ausliefern (ein Prozess, ein Port).
    if (settings.web_dist / "index.html").is_file():
        app.mount("/", StaticFiles(directory=settings.web_dist, html=True), name="web")
    return app


app = create_app()
