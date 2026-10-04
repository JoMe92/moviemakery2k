// Mirror, vertical: flips the picture top-bottom (ffmpeg vflip).
vec4 effect(vec2 uv) {
  return getColor(vec2(uv.x, 1.0 - uv.y));
}
