#version 300 es
// Samples the Canvas2D-rasterised title texture (design.md D1–D2,
// add-titles-and-credits). Opaque-vs-overlay compositing is controlled by
// `gl.BLEND` state at draw time, not by this shader.
precision highp float;

uniform sampler2D uTitle;

in vec2 vUv;
out vec4 fragColor;

void main() {
  // title-vertex.glsl's fullscreen-triangle trick overshoots the logical
  // 0…1 quad so that, untransformed, clipping to NDC exactly reconstructs
  // it; a non-identity uTranslate/uScale shifts that overshoot into view
  // too, so it must be discarded here instead of sampled (CLAMP_TO_EDGE
  // would otherwise smear the texture's edge across it).
  if (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0) {
    discard;
  }
  fragColor = texture(uTitle, vUv);
}
