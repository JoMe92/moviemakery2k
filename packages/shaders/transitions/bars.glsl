// Bars (Basic catalog "Bars"): alternating vertical/horizontal bars open from
// opposite ends like venetian blinds (packages/shaders/prelude.glsl barsT()/wipeReveal()).
uniform float axis;
uniform float barCount;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(barsT(uv, axis, barCount), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
