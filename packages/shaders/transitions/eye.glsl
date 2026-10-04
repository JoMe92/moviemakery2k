// Eye (SMPTE 122): an almond-shaped iris grows from the centre
// (packages/shaders/prelude.glsl eyeT()/wipeReveal()).
uniform float borderSoftness;

vec4 transition(vec2 uv) {
  float w = wipeReveal(eyeT(uv), borderSoftness);
  return mix(getFromColor(uv), getToColor(uv), w);
}
