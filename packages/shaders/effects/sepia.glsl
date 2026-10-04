// Sepia: fixed colour matrix (classic sepia weights).
vec4 effect(vec2 uv) {
  vec4 color = getColor(uv);
  float r = dot(color.rgb, vec3(0.393, 0.769, 0.189));
  float g = dot(color.rgb, vec3(0.349, 0.686, 0.168));
  float b = dot(color.rgb, vec3(0.272, 0.534, 0.131));
  return vec4(clamp(vec3(r, g, b), 0.0, 1.0), color.a);
}
