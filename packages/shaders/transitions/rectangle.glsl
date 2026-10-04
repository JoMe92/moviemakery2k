// Rectangle (SMPTE 101): a rectangle grows from the centre and reveals the
// target picture (packages/shaders/prelude.glsl rectangleT()/wipeReveal()),
// the Chebyshev-distance sibling of circle.glsl.
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(rectangleT(uv), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
