"""GET /api/health - Lebenszeichen samt FFmpeg-Version."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from mmy_backend.ffmpeg import ffmpeg_version

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    ffmpeg: str | None


@router.get("/health")
def health() -> Health:
    return Health(ffmpeg=ffmpeg_version())
