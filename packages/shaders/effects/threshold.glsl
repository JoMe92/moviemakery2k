// Threshold: luma below `threshold` becomes black, at or above becomes white.
uniform float threshold;

vec4 effect(vec2 uv) {
  vec4 color = getColor(uv);
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  float value = luma < threshold ? 0.0 : 1.0;
  return vec4(vec3(value), color.a);
}
