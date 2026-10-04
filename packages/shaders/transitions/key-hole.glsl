// Key Hole (SMPTE 131): a round hole above a rising neck, like a literal
// keyhole silhouette (packages/shaders/prelude.glsl keyHoleT()/wipeReveal()).
uniform float borderSoftness;

vec4 transition(vec2 uv) {
  float w = wipeReveal(keyHoleT(uv), borderSoftness);
  return mix(getFromColor(uv), getToColor(uv), w);
}
