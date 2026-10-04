// Posterize: quantizes each channel to `levels` steps.
uniform float levels;

vec4 effect(vec2 uv) {
  vec4 color = getColor(uv);
  float steps = max(levels - 1.0, 1.0);
  vec3 quantized = floor(color.rgb * levels) / steps;
  return vec4(clamp(quantized, 0.0, 1.0), color.a);
}
