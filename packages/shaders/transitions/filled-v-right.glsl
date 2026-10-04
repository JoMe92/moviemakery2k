// Filled V, right (SMPTE 64): a wedge pointing out of the left edge, opening
// rightward (packages/shaders/prelude.glsl filledVT()/wipeReveal()).
uniform float apexAngleDeg;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(filledVT(uv, apexAngleDeg), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
