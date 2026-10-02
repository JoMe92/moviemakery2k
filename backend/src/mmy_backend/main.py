from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from mmy_backend.ffmpeg import ffmpeg_version

app = FastAPI(title="moviemakerY2K", version="0.0.0")


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    ffmpeg: str | None


@app.get("/api/health")
def health() -> Health:
    return Health(ffmpeg=ffmpeg_version())
