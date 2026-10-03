// Mirror, horizontal: flips the picture left-right (ffmpeg hflip).
vec4 effect(vec2 uv) {
  return getColor(vec2(1.0 - uv.x, uv.y));
}
