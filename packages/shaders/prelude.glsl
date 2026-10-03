#version 300 es
// Frame placed before every transition shader (see README: Shader contract).
precision highp float;
precision highp int;

uniform sampler2D uFrom;
uniform sampler2D uTo;
// Transition progress, 0.0 = source picture only, 1.0 = target picture only.
uniform float progress;
// Output size in pixels (frame space, 4:3).
uniform vec2 resolution;

in vec2 vUv;
out vec4 fragColor;

vec4 getFromColor(vec2 uv) { return texture(uFrom, uv); }
vec4 getToColor(vec2 uv) { return texture(uTo, uv); }

// Shared wipe geometry (add-transition-catalog, design.md D1): the Basic/SMPTE
// wipe family reveals the target along an edge shape, each shape reduced to a
// 0..1 "distance" coordinate t (0 at the edge that reveals first, 1 at the one
// that reveals last) fed through a common soft-edged reveal. This generalizes
// the formula already used by wipe-right.glsl/circle.glsl so new entries only
// need a thin `transitions/<id>.glsl` that picks a shape function and its own
// uniforms (see packages/shaders/README.md: one file per catalog id).

// Mix weight (0 = from, 1 = to) for a reveal coordinate t with soft edge g.
float wipeReveal(float t, float g) {
  float gg = max(g, 1e-4);
  return clamp((progress * (1.0 + gg) - t) / gg, 0.0, 1.0);
}

// Straight edge travelling in direction angleDeg (0 = right, 90 = up, 180 =
// left, 270 = down; counter-clockwise, uv origin bottom left), normalized so
// the picture's first corner in that direction is 0 and the last is 1.
float barWipeT(vec2 uv, float angleDeg) {
  float a = radians(angleDeg);
  float cx = cos(a);
  float sy = sin(a);
  float denom = max(abs(cx) + abs(sy), 1e-4);
  float proj = (uv.x - 0.5) * cx + (uv.y - 0.5) * sy;
  return (proj + 0.5 * denom) / denom;
}

// Distance from the vertical (axis < 0.5) or horizontal (axis >= 0.5) centre
// line, 0 at the centre and 1 at the picture edge: the two halves wipe open
// from the middle outward.
float splitT(vec2 uv, float axis) {
  return axis < 0.5 ? abs(uv.x - 0.5) * 2.0 : abs(uv.y - 0.5) * 2.0;
}

// Rectangle iris growing from the centre (Chebyshev distance): 0 at the
// centre, 1 at the picture edge.
float rectangleT(vec2 uv) {
  return max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0;
}

// Diamond iris growing from the centre (Manhattan distance): 0 at the centre,
// 1 at the picture corners.
float diamondT(vec2 uv) {
  return abs(uv.x - 0.5) + abs(uv.y - 0.5);
}

// `count` vertical (axis < 0.5) or horizontal (axis >= 0.5) bars; alternating
// bars reveal from opposite ends, like venetian blinds opening.
float barsT(vec2 uv, float axis, float count) {
  float n = max(floor(count), 1.0);
  float crossPos = axis < 0.5 ? uv.x : uv.y;
  float alongPos = axis < 0.5 ? uv.y : uv.x;
  float index = floor(crossPos * n);
  bool reverseDir = mod(index, 2.0) >= 1.0;
  return reverseDir ? alongPos : 1.0 - alongPos;
}
