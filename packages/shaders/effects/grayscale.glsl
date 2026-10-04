// Grayscale: BT.601 luma replicated to every channel.
vec4 effect(vec2 uv) {
  vec4 color = getColor(uv);
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  return vec4(vec3(luma), color.a);
}
