// Filled V, down (SMPTE 62): a wedge pointing out of the top edge, opening
// downward (packages/shaders/prelude.glsl filledVT()/wipeReveal()).
uniform float apexAngleDeg;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(filledVT(uv, apexAngleDeg), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
