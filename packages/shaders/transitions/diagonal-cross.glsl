// Diagonal Cross (SMPTE 47): reveals first along the two screen diagonals,
// spreading outward to the edge midpoints (packages/shaders/prelude.glsl
// diagonalCrossT()/wipeReveal()).
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(diagonalCrossT(uv), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
