// Negative: inverts every channel.
vec4 effect(vec2 uv) {
  vec4 color = getColor(uv);
  return vec4(1.0 - color.rgb, color.a);
}
