// Fade: linear blend without black in between (DXT Fade, Overlap 1.0).
vec4 transition(vec2 uv) {
  return mix(getFromColor(uv), getToColor(uv), progress);
}
