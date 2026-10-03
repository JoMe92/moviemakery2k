// Film grain: deterministic per-pixel noise added to luma (same PCG hash as
// the Dissolve transition, so every GPU renders the same picture).
uniform float amount;

uint pcgHash(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

vec4 effect(vec2 uv) {
  vec4 color = getColor(uv);
  ivec2 pixel = ivec2(uv * resolution);
  uint h = pcgHash(uint(pixel.x) ^ pcgHash(uint(pixel.y)));
  float noise = (float(h & 0x00FFFFFFu) / 16777216.0 - 0.5) * 2.0 * amount;
  return vec4(clamp(color.rgb + noise, 0.0, 1.0), color.a);
}
