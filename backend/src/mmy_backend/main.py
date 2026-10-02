"""FastAPI-App. `create_app` lädt den Übergangskatalog sofort: ist er ungültig,
bricht schon der Import von `mmy_backend.main:app` (und damit uvicorn) ab."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from mmy_backend.api import router
from mmy_backend.catalog import load_catalog
from mmy_backend.config import Settings
from mmy_backend.media import MediaStore


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    catalog = load_catalog(settings.catalog_file)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        yield

    app = FastAPI(title="moviemakerY2K", version="0.0.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.catalog = catalog
    app.state.media = MediaStore(settings.data_dir)
    app.include_router(router)
    return app


app = create_app()
