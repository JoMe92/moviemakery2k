// Pixelate (as an effect, fixed-size - distinct from the Pixelate transition):
// coarse blocks of the picture. `blockSize` in pixels at 640 px width.
uniform float blockSize;

vec4 effect(vec2 uv) {
  float size = max(1.0, blockSize * resolution.x / 640.0);
  // Sample at the block centre; at size 1 exactly the pixel centre.
  vec2 cell = (floor(uv * resolution / size) + 0.5) * size / resolution;
  return getColor(min(cell, vec2(1.0)));
}
