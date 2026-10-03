// Diamond (SMPTE 102): a diamond grows from the centre and reveals the
// target picture (packages/shaders/prelude.glsl diamondT()/wipeReveal()),
// the Manhattan-distance sibling of circle.glsl.
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(diamondT(uv), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
