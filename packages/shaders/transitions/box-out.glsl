// Box Out (SMPTE 48): four boxes grow inward from the picture's corners,
// meeting last along the centre cross (packages/shaders/prelude.glsl
// boxOutT()/wipeReveal()).
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(boxOutT(uv), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
