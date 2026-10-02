# Laufzeit-Image fürs Backend, gebaut aus der Pixi-Umgebung `prod`
# (FFmpeg, Python und alle Abhängigkeiten aus pixi.lock).
# Build-Kontext ist die Repo-Wurzel:  docker build -f backend/Dockerfile .
FROM ghcr.io/prefix-dev/pixi:0.81.0 AS build

WORKDIR /app
COPY pixi.toml pixi.lock ./
COPY backend/pyproject.toml backend/
COPY backend/src backend/src
RUN pixi install --locked -e prod \
    && pixi shell-hook -e prod -s bash > /shell-hook \
    && echo 'exec "$@"' >> /shell-hook

FROM ubuntu:24.04
WORKDIR /app
COPY --from=build /app/.pixi/envs/prod /app/.pixi/envs/prod
COPY --from=build /app/backend /app/backend
COPY --from=build /shell-hook /shell-hook
COPY packages/catalog /app/packages/catalog

ENV MMY_CATALOG_DIR=/app/packages/catalog \
    MMY_DATA_DIR=/data \
    PYTHONNOUSERSITE=1
VOLUME /data
EXPOSE 8000
ENTRYPOINT ["/bin/bash", "/shell-hook"]
CMD ["uvicorn", "mmy_backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
