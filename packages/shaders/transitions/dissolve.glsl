// Auflösen: Blöcke des Zielbilds erscheinen in zufälliger, aber fester Reihenfolge.
// Pseudozufall über einen Integer-Hash (PCG), damit jede GPU dasselbe Bild liefert.
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
  // Schwelle in [0, 1): bei progress 0 nie, bei progress 1 immer erreicht.
  float threshold = float(h & 0x00FFFFFFu) / 16777216.0;
  return threshold < progress ? getToColor(uv) : getFromColor(uv);
}
