// Rotate 270°, clockwise (= 90° counter-clockwise).
vec4 effect(vec2 uv) {
  return getColor(vec2(uv.y, 1.0 - uv.x));
}
