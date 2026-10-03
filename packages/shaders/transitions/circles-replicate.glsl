// Circles, Replicate 8x6 (SMPTE 119 variant): an 8x6 grid of independent
// circle irises (packages/shaders/prelude.glsl circlesReplicateT()/wipeReveal()).
uniform float borderSoftness;
uniform float replicateX;
uniform float replicateY;

vec4 transition(vec2 uv) {
  vec2 cellSize = resolution / max(floor(vec2(replicateX, replicateY)), 1.0);
  float w = wipeReveal(
    circlesReplicateT(uv, replicateX, replicateY),
    radialSoftFraction(borderSoftness, cellSize)
  );
  return mix(getFromColor(uv), getToColor(uv), w);
}
