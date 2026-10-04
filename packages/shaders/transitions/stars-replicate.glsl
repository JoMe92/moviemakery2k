// Stars, Replicate (SMPTE 128 variant): a grid of independent star irises
// (packages/shaders/prelude.glsl starsReplicateT()/wipeReveal()).
uniform float borderSoftness;
uniform float replicateX;
uniform float replicateY;

vec4 transition(vec2 uv) {
  vec2 cellSize = resolution / max(floor(vec2(replicateX, replicateY)), 1.0);
  float w = wipeReveal(
    starsReplicateT(uv, replicateX, replicateY),
    radialSoftFraction(borderSoftness, cellSize)
  );
  return mix(getFromColor(uv), getToColor(uv), w);
}
