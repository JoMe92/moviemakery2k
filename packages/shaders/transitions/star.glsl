// Star, 5-pointed (SMPTE 128): a star-shaped iris grows from the centre
// (packages/shaders/prelude.glsl starT()/wipeReveal()).
uniform float borderSoftness;

vec4 transition(vec2 uv) {
  float w = wipeReveal(starT(uv), borderSoftness);
  return mix(getFromColor(uv), getToColor(uv), w);
}
