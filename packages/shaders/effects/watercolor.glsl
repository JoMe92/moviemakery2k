// Watercolor (approximation, design.md D1): 3x3 box smoothing followed by
// posterizing into `levels` steps, giving flat colour pools instead of a true
// Kuwahara filter (docs/research/movie-maker-reference.md §4 names Kuwahara
// as the original technique; this project substitutes the cheaper, already
// validated blur+posterize pair - see effects.json source.estimated).
uniform float radius;
uniform float levels;

vec4 effect(vec2 uv) {
  vec2 step = radius * (resolution.x / 640.0) / resolution;
  vec4 sum = vec4(0.0);
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      sum += getColor(uv + vec2(float(dx), float(dy)) * step);
    }
  }
  vec3 smoothed = (sum / 9.0).rgb;
  float stepsQ = max(levels - 1.0, 1.0);
  vec3 quantized = floor(smoothed * levels) / stepsQ;
  return vec4(clamp(quantized, 0.0, 1.0), getColor(uv).a);
}
