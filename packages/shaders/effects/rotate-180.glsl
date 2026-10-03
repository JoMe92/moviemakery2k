// Rotate 180°.
vec4 effect(vec2 uv) {
  return getColor(1.0 - uv);
}
