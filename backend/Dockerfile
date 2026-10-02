# Laufzeit-Image fürs Backend, gebaut aus der Pixi-Umgebung `prod`
# (FFmpeg, Python, Mesa llvmpipe und alle Abhängigkeiten aus pixi.lock).
# Build-Kontext ist die Repo-Wurzel:  docker build -f backend/Dockerfile .
FROM ghcr.io/prefix-dev/pixi:0.81.0 AS build

WORKDIR /app
COPY pixi.toml pixi.lock ./
COPY backend/pyproject.toml backend/
COPY backend/src backend/src
# Der Shell-Hook enthält auch die linux-64-Aktivierungsvariablen aus pixi.toml
# (__EGL_VENDOR_LIBRARY_DIRS, GLCONTEXT_LINUX_LIBEGL, GLCONTEXT_LINUX_LIBGL);
# ohne sie fände der Export weder den Mesa-ICD noch libEGL der Umgebung.
RUN pixi install --locked -e prod \
    && pixi shell-hook -e prod -s bash > /shell-hook \
    && for var in __EGL_VENDOR_LIBRARY_DIRS GLCONTEXT_LINUX_LIBEGL GLCONTEXT_LINUX_LIBGL; do \
         grep -q "^export $var=" /shell-hook || { echo "shell-hook ohne $var" >&2; exit 1; }; \
       done \
    && echo 'exec "$@"' >> /shell-hook

FROM ubuntu:24.04
WORKDIR /app
# Gleicher Pfad wie in der Build-Stufe: Der Shell-Hook enthält absolute Pfade.
COPY --from=build /app/.pixi/envs/prod /app/.pixi/envs/prod
COPY --from=build /app/backend /app/backend
COPY --from=build /shell-hook /shell-hook
COPY packages/catalog /app/packages/catalog
COPY packages/shaders /app/packages/shaders
COPY scripts/check_render_env.py /app/scripts/check_render_env.py

ENV MMY_CATALOG_DIR=/app/packages/catalog \
    MMY_SHADERS_DIR=/app/packages/shaders \
    MMY_DATA_DIR=/data \
    PYTHONNOUSERSITE=1

# Export-Renderer im fertigen Image prüfen (design.md D1, D8): EGL/llvmpipe-
# Kontext, Testframe, FFmpeg mit libx264 und aac. Schlägt sonst den Build fehl.
RUN ["/bin/bash", "/shell-hook", "python", "/app/scripts/check_render_env.py"]

VOLUME /data
EXPOSE 8000
ENTRYPOINT ["/bin/bash", "/shell-hook"]
CMD ["uvicorn", "mmy_backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
