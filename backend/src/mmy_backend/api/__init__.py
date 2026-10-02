"""HTTP-Router des Backends; alle Endpunkte liegen unter /api."""

from fastapi import APIRouter

from mmy_backend.api import catalog, exports, health, media, project

router = APIRouter(prefix="/api")
router.include_router(health.router)
router.include_router(catalog.router)
router.include_router(media.router)
router.include_router(project.router)
router.include_router(exports.router)

__all__ = ["router"]
