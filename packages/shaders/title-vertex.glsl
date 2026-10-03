#version 300 es
// Fullscreen triangle (see vertex.glsl) whose position is translated and
// scaled in clip space for a title's position/zoom per phase
// (design.md D3, add-titles-and-credits). `vUv` still spans 0…1 across the
// visible quad regardless of the transform.
out vec2 vUv;

// Clip-space offset of the quad's centre; 0 = centred, ±1 = one half-frame.
uniform vec2 uTranslate;
// 1.0 = natural (frame-filling) size.
uniform vec2 uScale;

void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = pos;
  vec2 clip = (pos * 2.0 - 1.0) * uScale + uTranslate;
  gl_Position = vec4(clip, 0.0, 1.0);
}
