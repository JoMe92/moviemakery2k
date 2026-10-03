// Windshield, right (SMPTE 263): a wiper-like blade sweeps from a pivot at
// the bottom-right corner (packages/shaders/prelude.glsl fanT()/wipeReveal()).
uniform float pivotX;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(fanT(uv, pivotX), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
