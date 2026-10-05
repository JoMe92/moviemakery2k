# Runtime image for the backend, built from the Pixi environment `prod`
# (FFmpeg, Python, Mesa llvmpipe and all dependencies from pixi.lock).
# The build context is the repo root:  docker build -f backend/Dockerfile .
FROM ghcr.io/prefix-dev/pixi:0.81.0 AS build

WORKDIR /app
COPY pixi.toml pixi.lock ./
COPY backend/pyproject.toml backend/
COPY backend/src backend/src
# The shell hook also contains the linux-64 activation variables from pixi.toml
# (__EGL_VENDOR_LIBRARY_DIRS, GLCONTEXT_LINUX_LIBEGL, GLCONTEXT_LINUX_LIBGL);
# without them the export would find neither the Mesa ICD nor the environment's libEGL.
RUN pixi install --locked -e prod \
    && pixi shell-hook -e prod -s bash > /shell-hook \
    && for var in __EGL_VENDOR_LIBRARY_DIRS GLCONTEXT_LINUX_LIBEGL GLCONTEXT_LINUX_LIBGL; do \
         grep -q "^export $var=" /shell-hook || { echo "shell-hook without $var" >&2; exit 1; }; \
       done \
    && echo 'exec "$@"' >> /shell-hook

FROM ubuntu:24.04
WORKDIR /app
# Same path as in the build stage: the shell hook contains absolute paths.
COPY --from=build /app/.pixi/envs/prod /app/.pixi/envs/prod
COPY --from=build /app/backend /app/backend
COPY --from=build /shell-hook /shell-hook
COPY packages/catalog /app/packages/catalog
COPY packages/shaders /app/packages/shaders
# The bundled title font (add-titles-and-credits design.md D1): without it the
# export cannot rasterise a title.
COPY packages/fonts /app/packages/fonts
COPY scripts/check_render_env.py /app/scripts/check_render_env.py

ENV MMY_CATALOG_DIR=/app/packages/catalog \
    MMY_SHADERS_DIR=/app/packages/shaders \
    MMY_FONTS_DIR=/app/packages/fonts \
    MMY_DATA_DIR=/data \
    PYTHONNOUSERSITE=1

# Check the export renderer in the final image (design.md D1, D8): EGL/llvmpipe
# context, test frame, FFmpeg with libx264 and aac. Otherwise the build fails.
RUN ["/bin/bash", "/shell-hook", "python", "/app/scripts/check_render_env.py"]

VOLUME /data
EXPOSE 8000
ENTRYPOINT ["/bin/bash", "/shell-hook"]
CMD ["uvicorn", "mmy_backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
