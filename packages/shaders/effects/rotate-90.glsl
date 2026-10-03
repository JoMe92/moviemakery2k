// Rotate 90°, clockwise.
vec4 effect(vec2 uv) {
  return getColor(vec2(1.0 - uv.y, uv.x));
}
