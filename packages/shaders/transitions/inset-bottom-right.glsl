// Inset, bottom right (SMPTE 4): a box grows from the bottom-right corner to
// fill the screen (packages/shaders/prelude.glsl insetT()/wipeReveal()).
uniform float cornerX;
uniform float cornerY;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(insetT(uv, cornerX, cornerY), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
