// Bow Tie, Vertical (SMPTE 43): the vertical split pinches at mid-height and
// flares at top/bottom (packages/shaders/prelude.glsl bowTieT()/wipeReveal()).
uniform float axis;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(bowTieT(uv, axis), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
