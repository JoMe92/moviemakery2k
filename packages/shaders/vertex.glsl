#version 300 es
// Fullscreen triangle without a vertex buffer: gl.drawArrays(gl.TRIANGLES, 0, 3).
out vec2 vUv;

void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
