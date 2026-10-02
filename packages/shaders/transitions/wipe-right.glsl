// Wipe right: a vertical soft edge travels from left to right.
// gradientSize = width of the gradient as a fraction of the picture width (WMM: 0.5 "Normal").
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float g = max(gradientSize, 1e-4);
  // The edge runs from -g to 1 so that the borders at 0 and 1 are exactly pure.
  float w = clamp((progress * (1.0 + g) - uv.x) / g, 0.0, 1.0);
  return mix(getFromColor(uv), getToColor(uv), w);
}
