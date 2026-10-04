// Film aging, Oldest (`age` 90 - design.md D1): vignette + deterministic grain +
// desaturation, scaled by `age`. Approximates the original's noise/scratches/
// flicker/jitter/posterize/vignette (docs/research/movie-maker-reference.md
// §4) without per-frame animation (this catalog has no time-varying effects,
// see proposal.md "Nicht-Ziele"). Same shape as film-age-old/-older, one
// file per catalog entry (shader files are looked up by ID, 1:1).
uniform float age;

uint pcgHash(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

vec4 effect(vec2 uv) {
  vec4 color = getColor(uv);
  float intensity = clamp(age / 100.0, 0.0, 1.0);

  float dist = length(uv - 0.5) * 1.4142135;
  float vignette = 1.0 - intensity * 0.6 * dist * dist;

  ivec2 pixel = ivec2(uv * resolution);
  uint h = pcgHash(uint(pixel.x) ^ pcgHash(uint(pixel.y)));
  float noise = (float(h & 0x00FFFFFFu) / 16777216.0 - 0.5) * 2.0 * intensity * 0.12;

  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3 aged = mix(color.rgb, vec3(luma), intensity * 0.5);

  return vec4(clamp(aged * vignette + noise, 0.0, 1.0), color.a);
}
