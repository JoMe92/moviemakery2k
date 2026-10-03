// Wheel, 4 spokes (Basic catalog): four pie slices open in sync around the
// centre (packages/shaders/prelude.glsl sweepT()/wipeReveal()).
uniform float startAngleDeg;
uniform float spokes;
uniform float borderSoftness;

vec4 transition(vec2 uv) {
  float w = wipeReveal(sweepT(uv, startAngleDeg, spokes), borderSoftness);
  return mix(getFromColor(uv), getToColor(uv), w);
}
