// Split, Vertical (SMPTE 21): the picture opens along a vertical centre line,
// both halves revealing outward (packages/shaders/prelude.glsl splitT()/wipeReveal()).
uniform float axis;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(splitT(uv, axis), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
