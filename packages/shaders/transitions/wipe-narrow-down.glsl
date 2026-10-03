// Wipe, narrow down (Basic catalog "Wipe"): same formula as wipe-right.glsl, pointed
// down via packages/shaders/prelude.glsl barWipeT()/wipeReveal().
uniform float angleDeg;
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float w = wipeReveal(barWipeT(uv, angleDeg), gradientSize);
  return mix(getFromColor(uv), getToColor(uv), w);
}
