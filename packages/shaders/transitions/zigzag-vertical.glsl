// Zig Zag, Vertical (SMPTE 73): a vertical sweep with a jagged, zigzag edge
// instead of a straight one (packages/shaders/prelude.glsl zigzagT()/wipeReveal()).
uniform float axis;
uniform float count;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(zigzagT(uv, axis, count), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
