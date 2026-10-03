// Fan In (SMPTE 231): a fan blade sweeps out from a pivot at the bottom
// centre, reaching the bottom corners last (packages/shaders/prelude.glsl
// fanT()/wipeReveal()).
uniform float pivotX;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(fanT(uv, pivotX), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
