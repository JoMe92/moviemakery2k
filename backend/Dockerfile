# Laufzeit-Image fürs Backend. Debian trixie liefert FFmpeg 7.x (inkl. libx264;
# das Projekt ist GPL, siehe docs/adr/0001).
FROM python:3.13-slim-trixie

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev

EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "mmy_backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
