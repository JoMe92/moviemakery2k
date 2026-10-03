// Bow Tie, Horizontal (SMPTE 44): the horizontal split pinches at mid-width
// and flares at the left/right edges (packages/shaders/prelude.glsl bowTieT()/wipeReveal()).
uniform float axis;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(bowTieT(uv, axis), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
