// Swinging Door (SMPTE 253): a vertical split that opens widest at the
// hinge's mid-height, approximating a pair of hinged panels (packages/shaders/prelude.glsl
// swingingDoorT()/wipeReveal()).
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(swingingDoorT(uv), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
