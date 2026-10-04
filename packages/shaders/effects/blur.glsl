// Blur: 3x3 box average. `radius` in pixels at 640 px width (tap spacing).
uniform float radius;

vec4 effect(vec2 uv) {
  vec2 step = radius * (resolution.x / 640.0) / resolution;
  vec4 sum = vec4(0.0);
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      sum += getColor(uv + vec2(float(dx), float(dy)) * step);
    }
  }
  return sum / 9.0;
}
