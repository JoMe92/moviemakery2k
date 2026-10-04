// Sweep, Horizontal (SMPTE 228): a single clock-wipe sector starting from the
// horizontal and sweeping counter-clockwise (packages/shaders/prelude.glsl
// sweepT()/wipeReveal()).
uniform float startAngleDeg;
uniform float spokes;
uniform float borderSoftness;

vec4 transition(vec2 uv) {
  float w = wipeReveal(sweepT(uv, startAngleDeg, spokes), borderSoftness);
  return mix(getFromColor(uv), getToColor(uv), w);
}
