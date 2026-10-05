#!/usr/bin/env bash
# Smoke test for the movie export through the HTTP API.
#
# Default (Docker): builds the backend image (backend/Dockerfile), starts a
# container, uploads two generated PNG pictures, saves a project with both
# slides and a transition, exports it with the `small` profile, downloads the
# MP4 and checks it with ffprobe (H.264 640x480 + AAC, expected duration).
#
# Usage:
#   scripts/docker_export_smoke.sh                 # build + run the image
#   BASE_URL=http://127.0.0.1:8765 scripts/docker_export_smoke.sh
#                                                  # against a running backend,
#                                                  # no Docker involved
#
# Environment:
#   BASE_URL    test an already running backend instead of a container
#   IMAGE       image tag (default: mmy-export-smoke)
#   SKIP_BUILD  1 = use the existing IMAGE without building it
#   PORT        host port for the container (default: 18000)
#   TIMEOUT     seconds to wait for the export (default: 300)
#   FFPROBE     ffprobe binary; default: ffprobe on PATH, else the one in the
#               container (Docker mode only)
#   KEEP_OUTPUT directory to copy the downloaded MP4 into
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
IMAGE=${IMAGE:-mmy-export-smoke}
PORT=${PORT:-18000}
TIMEOUT=${TIMEOUT:-300}
CONTAINER=""
WORK=$(mktemp -d)

# Two picture slides of 3 s with a 1 s fade plus a 3 s title element (hard
# cut): 3 + 3 - 1 + 3 = 8 s, 240 frames at 30 fps. The title is part of the
# smoke test so that a missing bundled font in the image fails the build.
SLIDE_SECONDS=3
TRANSITION_SECONDS=1
EXPECTED_SECONDS=8
EXPECTED_WIDTH=640
EXPECTED_HEIGHT=480
EXPECTED_FRAMES=240

log() { printf '[export-smoke] %s\n' "$*" >&2; }
fail() {
  log "FAILED: $*"
  exit 1
}

cleanup() {
  local status=$?
  if [[ -n "$CONTAINER" ]]; then
    if [[ $status -ne 0 ]]; then
      log "container logs:"
      docker logs "$CONTAINER" >&2 || true
    fi
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

# json_field FILE EXPR: prints a value from a JSON file (EXPR indexes `data`).
json_field() {
  python3 - "$1" "$2" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)
print(eval(sys.argv[2], {"data": data}))
PY
}

# request METHOD PATH OUT [curl args...]: prints the HTTP status code.
request() {
  local method=$1 path=$2 out=$3
  shift 3
  curl -sS -o "$out" -w '%{http_code}' -X "$method" "$@" "$BASE_URL$path"
}

start_container() {
  if [[ "${SKIP_BUILD:-0}" != 1 ]]; then
    log "building $IMAGE from backend/Dockerfile"
    docker build -f "$REPO_ROOT/backend/Dockerfile" -t "$IMAGE" "$REPO_ROOT"
  fi
  log "starting container on port $PORT"
  CONTAINER=$(docker run -d -p "127.0.0.1:$PORT:8000" "$IMAGE")
  BASE_URL="http://127.0.0.1:$PORT"
}

wait_for_health() {
  local deadline=$((SECONDS + 60))
  until curl -fsS "$BASE_URL/api/health" -o "$WORK/health.json" 2>/dev/null; do
    if ((SECONDS >= deadline)); then
      fail "backend not healthy at $BASE_URL/api/health after 60 s"
    fi
    sleep 1
  done
  log "health: $(cat "$WORK/health.json")"
}

make_pictures() {
  python3 - "$WORK" <<'PY'
import struct
import sys
import zlib
from pathlib import Path


def png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    row = b"\x00" + bytes(rgb) * width
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(row * height))
        + chunk(b"IEND", b"")
    )


out = Path(sys.argv[1])
(out / "red.png").write_bytes(png(800, 600, (220, 30, 30)))
(out / "blue.png").write_bytes(png(600, 800, (30, 60, 220)))
PY
}

upload_pictures() {
  local code
  code=$(request POST /api/media "$WORK/media.json" \
    -F "files=@$WORK/red.png;type=image/png" -F "files=@$WORK/blue.png;type=image/png")
  [[ $code == 200 ]] || fail "POST /api/media → $code: $(cat "$WORK/media.json")"
  [[ $(json_field "$WORK/media.json" 'all(i["ok"] for i in data["items"])') == True ]] ||
    fail "upload rejected: $(cat "$WORK/media.json")"
  RED_ID=$(json_field "$WORK/media.json" 'data["items"][0]["item"]["id"]')
  BLUE_ID=$(json_field "$WORK/media.json" 'data["items"][1]["item"]["id"]')
  log "uploaded media $RED_ID, $BLUE_ID"
}

save_project() {
  local code
  cat >"$WORK/project.json" <<JSON
{
  "schemaVersion": 5,
  "music": [],
  "slides": [
    {"kind": "image", "id": "smoke-1", "mediaId": "$RED_ID", "duration": $SLIDE_SECONDS,
     "effectId": null, "title": null, "transitionIn": null},
    {"kind": "image", "id": "smoke-2", "mediaId": "$BLUE_ID", "duration": $SLIDE_SECONDS,
     "effectId": null, "title": null, "transitionIn": {"transitionId": "fade", "duration": $TRANSITION_SECONDS}},
    {"kind": "title", "id": "smoke-3", "lines": ["SMOKE"], "creditEntries": null,
     "styleId": "basic-title", "color": "#ffffff", "duration": $SLIDE_SECONDS,
     "transitionIn": null}
  ]
}
JSON
  code=$(request PUT /api/project "$WORK/project-response.json" \
    -H 'Content-Type: application/json' --data-binary "@$WORK/project.json")
  [[ $code == 200 ]] || fail "PUT /api/project → $code: $(cat "$WORK/project-response.json")"
}

run_export() {
  local code status progress deadline
  code=$(request POST /api/exports "$WORK/export.json" \
    -H 'Content-Type: application/json' --data '{"profile": "small", "fileName": "ci"}')
  [[ $code == 202 ]] || fail "POST /api/exports → $code: $(cat "$WORK/export.json")"
  EXPORT_ID=$(json_field "$WORK/export.json" 'data["id"]')
  log "export $EXPORT_ID started"

  deadline=$((SECONDS + TIMEOUT))
  while :; do
    code=$(request GET "/api/exports/$EXPORT_ID" "$WORK/status.json")
    [[ $code == 200 ]] || fail "GET /api/exports/$EXPORT_ID → $code: $(cat "$WORK/status.json")"
    status=$(json_field "$WORK/status.json" 'data["status"]')
    progress=$(json_field "$WORK/status.json" 'round(data["progress"] * 100)')
    case $status in
      done) break ;;
      failed | cancelled) fail "export $status: $(cat "$WORK/status.json")" ;;
    esac
    if ((SECONDS >= deadline)); then
      fail "export not done after $TIMEOUT s (status $status, $progress %)"
    fi
    log "export $status, $progress %"
    sleep 1
  done
  log "export done after ${SECONDS}s since script start"
}

download_movie() {
  local code
  code=$(request GET "/api/exports/$EXPORT_ID/file" "$WORK/ci.mp4" -D "$WORK/headers.txt")
  [[ $code == 200 ]] || fail "GET /api/exports/$EXPORT_ID/file → $code"
  grep -qi '^content-disposition:.*filename="ci.mp4"' "$WORK/headers.txt" ||
    fail "unexpected headers: $(cat "$WORK/headers.txt")"
  log "downloaded $(wc -c <"$WORK/ci.mp4") bytes"
}

probe_movie() {
  # -count_frames decodes the whole file, so a broken stream fails here.
  local -a probe=(-v error -count_frames
    -show_entries "stream=codec_type,codec_name,width,height,nb_read_frames"
    -show_entries format=duration -of json)
  if [[ -n "${FFPROBE:-}" ]]; then
    "$FFPROBE" "${probe[@]}" "$WORK/ci.mp4" >"$WORK/probe.json"
  elif command -v ffprobe >/dev/null; then
    ffprobe "${probe[@]}" "$WORK/ci.mp4" >"$WORK/probe.json"
  elif [[ -n "$CONTAINER" ]]; then
    docker cp "$WORK/ci.mp4" "$CONTAINER:/tmp/ci.mp4"
    docker exec "$CONTAINER" /bin/bash /shell-hook ffprobe "${probe[@]}" /tmp/ci.mp4 \
      >"$WORK/probe.json"
  else
    fail "no ffprobe found (set FFPROBE)"
  fi
  log "ffprobe: $(tr -d ' \n' <"$WORK/probe.json")"

  python3 - "$WORK/probe.json" "$EXPECTED_WIDTH" "$EXPECTED_HEIGHT" "$EXPECTED_SECONDS" \
    "$EXPECTED_FRAMES" <<'PY'
import json
import sys

probe = json.load(open(sys.argv[1], encoding="utf-8"))
width, height = int(sys.argv[2]), int(sys.argv[3])
seconds, frames = float(sys.argv[4]), int(sys.argv[5])
streams = {s["codec_type"]: s for s in probe["streams"]}
errors = []
video, audio = streams.get("video"), streams.get("audio")
if not video or video.get("codec_name") != "h264":
    errors.append(f"expected an h264 video stream, got {video}")
elif (video.get("width"), video.get("height")) != (width, height):
    errors.append(f"expected {width}x{height}, got {video.get('width')}x{video.get('height')}")
elif int(video.get("nb_read_frames") or 0) != frames:
    errors.append(f"expected {frames} decodable frames, got {video.get('nb_read_frames')}")
if not audio or audio.get("codec_name") != "aac":
    errors.append(f"expected an aac audio stream, got {audio}")
duration = float(probe.get("format", {}).get("duration") or 0)
# Tolerance: one frame at 30 fps plus container rounding.
if abs(duration - seconds) > 0.05:
    errors.append(f"expected a duration of {seconds} s, got {duration} s")
if errors:
    sys.exit("; ".join(errors))
print(f"MP4 OK: h264 {width}x{height}, {frames} frames + aac, {duration:.3f} s", file=sys.stderr)
PY
}

main() {
  if [[ -z "${BASE_URL:-}" ]]; then
    start_container
  else
    BASE_URL=${BASE_URL%/}
    log "using running backend at $BASE_URL (no Docker)"
  fi
  wait_for_health
  make_pictures
  upload_pictures
  save_project
  run_export
  download_movie
  probe_movie
  if [[ -n "${KEEP_OUTPUT:-}" ]]; then
    mkdir -p "$KEEP_OUTPUT"
    cp "$WORK/ci.mp4" "$KEEP_OUTPUT/"
    log "kept $KEEP_OUTPUT/ci.mp4"
  fi
  log "OK"
}

main "$@"
