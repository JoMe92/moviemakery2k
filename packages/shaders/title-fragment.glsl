#version 300 es
// Samples the Canvas2D-rasterised title texture (design.md D1–D2,
// add-titles-and-credits). Opaque-vs-overlay compositing is controlled by
// `gl.BLEND` state at draw time, not by this shader.
precision highp float;

uniform sampler2D uTitle;
// Phase opacity for the catalog's `fade` phase effect (design.md D4): 1.0 =
// fully visible. A freestanding title is rasterised onto its own opaque black
// background, so fading it in over a black-cleared frame yields exactly the
// original's fade; an overlay title fades over the picture beneath it.
uniform float uAlpha;

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
  fragColor.a *= uAlpha;
}
