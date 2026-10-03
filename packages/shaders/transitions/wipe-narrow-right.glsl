// Wipe, narrow right (Basic catalog "Wipe"): same edge as wipe-right.glsl, generalized
// to any angle/width via packages/shaders/prelude.glsl barWipeT()/wipeReveal().
uniform float angleDeg;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(barWipeT(uv, angleDeg), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
