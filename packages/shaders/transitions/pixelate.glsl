// Pixelate (DXT Pixelate): ever coarser blocks of the source picture up to the midpoint,
// the switch to the target picture there, then sharp again. maxSquare in pixels at 640 px width.
uniform float maxSquare;

vec4 transition(vec2 uv) {
  float ramp = 1.0 - abs(2.0 * progress - 1.0);
  float size = max(1.0, floor(1.0 + (maxSquare * resolution.x / 640.0 - 1.0) * ramp + 0.5));
  // Sample at the block centre; at size 1 exactly the pixel centre.
  vec2 cell = (floor(uv * resolution / size) + 0.5) * size / resolution;
  vec2 sampleUv = size <= 1.0 ? uv : min(cell, vec2(1.0));
  return progress < 0.5 ? getFromColor(sampleUv) : getToColor(sampleUv);
}
