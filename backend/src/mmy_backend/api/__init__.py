"""HTTP-Router des Backends; alle Endpunkte liegen unter /api."""

from fastapi import APIRouter

from mmy_backend.api import catalog, health

router = APIRouter(prefix="/api")
router.include_router(health.router)
router.include_router(catalog.router)

__all__ = ["router"]
