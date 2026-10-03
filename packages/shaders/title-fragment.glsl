#version 300 es
// Samples the Canvas2D-rasterised title texture (design.md D1–D2,
// add-titles-and-credits). Opaque-vs-overlay compositing is controlled by
// `gl.BLEND` state at draw time, not by this shader.
precision highp float;

uniform sampler2D uTitle;

in vec2 vUv;
out vec4 fragColor;

void main() {
  fragColor = texture(uTitle, vUv);
}
