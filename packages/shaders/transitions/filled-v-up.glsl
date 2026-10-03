// Filled V, up (SMPTE 61): a wedge pointing out of the bottom edge, opening
// upward (packages/shaders/prelude.glsl filledVT()/wipeReveal()).
uniform float apexAngleDeg;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(filledVT(uv, apexAngleDeg), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
