// Diagonal Down Right (SMPTE 41): a straight edge sweeps from the top-left
// corner to the bottom-right corner via packages/shaders/prelude.glsl
// barWipeT()/wipeReveal(), the same formula as wipe-right.glsl at a 45°-family angle.
uniform float angleDeg;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(barWipeT(uv, angleDeg), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
