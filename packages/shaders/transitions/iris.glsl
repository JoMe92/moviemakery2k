// Iris (Basic catalog, same shape as circle.glsl's SMPTE 119 "Circle, Out,
// Soft"): a circle grows from the centre (packages/shaders/prelude.glsl
// circleT()/radialSoftFraction()/wipeReveal()).
uniform float borderSoftness;

vec4 transition(vec2 uv) {
  float w = wipeReveal(circleT(uv), radialSoftFraction(borderSoftness, resolution));
  return mix(getFromColor(uv), getToColor(uv), w);
}
