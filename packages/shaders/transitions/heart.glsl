// Heart (SMPTE 130): a heart-shaped iris grows from the centre
// (packages/shaders/prelude.glsl heartT()/wipeReveal()).
uniform float borderSoftness;

vec4 transition(vec2 uv) {
  float w = wipeReveal(heartT(uv), borderSoftness);
  return mix(getFromColor(uv), getToColor(uv), w);
}
