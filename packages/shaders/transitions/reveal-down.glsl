// Reveal, Down (SMPTE 2): a hard-edged wipe downward, the SMPTE sibling of
// the DXT Wipe family (packages/shaders/prelude.glsl barWipeT()/wipeReveal()).
uniform float angleDeg;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(barWipeT(uv, angleDeg), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
