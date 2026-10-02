// Dissolve: blocks of the target picture appear in a random but fixed order.
// Pseudo-randomness via an integer hash (PCG), so every GPU renders the same picture.
uniform float blockSize;
uniform float seed;

uint pcgHash(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

vec4 transition(vec2 uv) {
  float size = max(1.0, blockSize * resolution.x / 640.0);
  uvec2 cell = uvec2(floor(uv * resolution / size));
  uint h = pcgHash(cell.x ^ pcgHash(cell.y ^ pcgHash(uint(seed))));
  // Threshold in [0, 1): never reached at progress 0, always reached at progress 1.
  float threshold = float(h & 0x00FFFFFFu) / 16777216.0;
  return threshold < progress ? getToColor(uv) : getFromColor(uv);
}
