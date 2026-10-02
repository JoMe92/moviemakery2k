// Circle (SMPTE 119 "Circle, Out, Soft"): a circle grows from the centre and reveals the target picture.
// borderSoftness = width of the soft edge in pixels at a picture width of 640 px.
uniform float borderSoftness;

vec4 transition(vec2 uv) {
  vec2 p = (uv - 0.5) * resolution;
  float d = length(p);
  float maxRadius = 0.5 * length(resolution);
  float soft = max(borderSoftness * resolution.x / 640.0, 1e-3);
  float radius = progress * (maxRadius + soft);
  float w = clamp((radius - d) / soft, 0.0, 1.0);
  return mix(getFromColor(uv), getToColor(uv), w);
}
