// Charcoal (Smudge Stick approximation, design.md D1): Sobel edge magnitude on
// luma, drawn as dark strokes on a light paper tone. `strength` scales the edges.
uniform float strength;

float luma(vec4 c) { return dot(c.rgb, vec3(0.299, 0.587, 0.114)); }

vec4 effect(vec2 uv) {
  vec2 step = (resolution.x / 640.0) / resolution;
  float tl = luma(getColor(uv + vec2(-1.0, 1.0) * step));
  float tc = luma(getColor(uv + vec2(0.0, 1.0) * step));
  float tr = luma(getColor(uv + vec2(1.0, 1.0) * step));
  float ml = luma(getColor(uv + vec2(-1.0, 0.0) * step));
  float mr = luma(getColor(uv + vec2(1.0, 0.0) * step));
  float bl = luma(getColor(uv + vec2(-1.0, -1.0) * step));
  float bc = luma(getColor(uv + vec2(0.0, -1.0) * step));
  float br = luma(getColor(uv + vec2(1.0, -1.0) * step));

  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  float edge = length(vec2(gx, gy));

  float value = clamp(0.85 - edge * strength, 0.0, 1.0);
  return vec4(vec3(value), getColor(uv).a);
}
