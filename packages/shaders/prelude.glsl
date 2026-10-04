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

// TASK-FX-006 (design.md D1): the polygon-edged members of the same Linear-/
// Winkel-Wipe family, built from the same soft-edged wipeReveal() plus the
// straight-edge barWipeT() above. Exact source geometry for most of these
// (movie-maker-reference.md §3's SMPTE MaskNums 43/44/47/48/61–64/73/74/
// 231/253/262/263) is not independently available offline; each shape below
// reproduces the named effect (pinch, cross, wedge, zigzag, corner, fan,
// hinge) with a formula that still satisfies the hard contract (exactly
// `from` at progress 0, exactly `to` at 1) - catalog entries mark the
// geometry as estimated accordingly.

// Split (splitT) with the edge pinched at the centre of the line and flared
// at its ends, giving an hourglass/bow-tie taper instead of a straight edge.
float bowTieT(vec2 uv, float axis) {
  float p = axis < 0.5 ? abs(uv.x - 0.5) * 2.0 : abs(uv.y - 0.5) * 2.0;
  float q = axis < 0.5 ? abs(uv.y - 0.5) * 2.0 : abs(uv.x - 0.5) * 2.0;
  return clamp(p * (0.5 + 0.5 * q), 0.0, 1.0);
}

// Distance to the nearer of the two screen diagonals: 0 along the X formed by
// them (revealed first), growing to 1 at the left/right (or top/bottom) edge
// midpoints, farthest from both diagonals.
float diagonalCrossT(vec2 uv) {
  float a = abs((uv.x - 0.5) + (uv.y - 0.5));
  float b = abs((uv.x - 0.5) - (uv.y - 0.5));
  return clamp(min(a, b) * 2.0, 0.0, 1.0);
}

// Chebyshev distance to the nearest of the four corners: each corner reveals
// its own expanding box inward, all four meeting last along the centre cross.
float boxOutT(vec2 uv) {
  float tl = max(abs(uv.x - 0.0), abs(uv.y - 1.0));
  float tr = max(abs(uv.x - 1.0), abs(uv.y - 1.0));
  float bl = max(abs(uv.x - 0.0), abs(uv.y - 0.0));
  float br = max(abs(uv.x - 1.0), abs(uv.y - 0.0));
  return clamp(min(min(tl, tr), min(bl, br)) * 2.0, 0.0, 1.0);
}

// A filled V/wedge whose point touches the picture edge in direction
// `apexAngleDeg` and opens toward the opposite edge: the along-axis distance
// from that edge (barWipeT) and the lateral distance from the axis's centre
// line, both already 0..1, combined with max() so only the apex point itself
// (where both are 0) reveals first and the wedge widens as either grows.
float filledVT(vec2 uv, float apexAngleDeg) {
  float along = barWipeT(uv, apexAngleDeg);
  float lateral = abs(barWipeT(uv, apexAngleDeg + 90.0) - 0.5) * 2.0;
  return clamp(max(along, lateral), 0.0, 1.0);
}

// A straight vertical (axis < 0.5) or horizontal (axis >= 0.5) sweep whose
// edge is perturbed by a `count`-period triangle wave along the perpendicular
// axis, giving it a sawtooth/zigzag outline instead of a straight line.
float zigzagT(vec2 uv, float axis, float count) {
  float crossPos = axis < 0.5 ? uv.x : uv.y;
  float alongPos = axis < 0.5 ? uv.y : uv.x;
  float n = max(count, 1.0);
  float wave = abs(fract(alongPos * n) - 0.5) * 2.0;
  return clamp(crossPos + 0.1 * (wave - 0.5), 0.0, 1.0);
}

// Chebyshev distance from the picture corner (cornerX, cornerY) in {0, 1}²:
// a box grows outward from that single corner to fill the screen.
float insetT(vec2 uv, float cornerX, float cornerY) {
  vec2 d = abs(uv - vec2(cornerX, cornerY));
  return clamp(max(d.x, d.y), 0.0, 1.0);
}

// Angular sweep (a fan blade) pivoting at (pivotX, 0): 0 directly above the
// pivot, 1 level with it - used both for a centred "fan in" (pivotX = 0.5)
// and for a wiper-like sweep hinged at a bottom corner (pivotX = 0 or 1).
float fanT(vec2 uv, float pivotX) {
  vec2 p = uv - vec2(pivotX, 0.0);
  float angle = abs(atan(p.x, max(p.y, 1e-4)));
  return clamp(angle / (0.5 * 3.14159265), 0.0, 1.0);
}

// Split (splitT) biased so the opening is widest at the vertical centre
// (the door's hinge height) and narrowest at the top/bottom, approximating a
// pair of hinged panels swinging open (true hinge perspective needs a 3D
// renderer, out of scope per proposal.md "Nicht-Ziele").
float swingingDoorT(vec2 uv) {
  float p = abs(uv.x - 0.5) * 2.0;
  float bulge = 1.0 - abs(uv.y - 0.5) * 2.0;
  return clamp(p - 0.15 * bulge + 0.15, 0.0, 1.0);
}

// TASK-FX-007 (design.md D1): the Radial-/Kurven-Wipe family, generalizing
// circle.glsl's centre-out iris. Angle 0 is +x (right), increasing
// counter-clockwise, matching barWipeT()'s convention; uv origin bottom left.

float radialAngle(vec2 uv) { return atan(uv.y - 0.5, uv.x - 0.5); }
float radialDistPx(vec2 uv) { return length((uv - 0.5) * resolution); }

// A circle-family soft-edge size (pixels at a 640 px wide picture, matching
// circle.glsl's own convention for its own equivalent parameter) as a
// fraction of half of `sizePx`'s diagonal, for feeding into wipeReveal()
// alongside a radial *T() below that is itself normalized to that same size
// (0 at its centre, 1 at its own corner).
float radialSoftFraction(float softPx, vec2 sizePx) {
  float soft = max(softPx * resolution.x / 640.0, 1e-3);
  return soft / max(0.5 * length(sizePx), 1e-3);
}

// Circle/Iris (SMPTE 119 "Circle, Out, Soft", same formula as circle.glsl):
// 0 at the centre, 1 at the picture's corners.
float circleT(vec2 uv) {
  return clamp(radialDistPx(uv) / max(0.5 * length(resolution), 1e-3), 0.0, 1.0);
}

// Circles, Replicate N×M (SMPTE 119 variant): an N×M grid of independent
// circle-shaped irises, one per cell, all on the same global progress.
float circlesReplicateT(vec2 uv, float replicateX, float replicateY) {
  vec2 n = max(floor(vec2(replicateX, replicateY)), 1.0);
  vec2 cellSize = resolution / n;
  vec2 cellPx = (fract(uv * n) - 0.5) * cellSize;
  return clamp(length(cellPx) / max(0.5 * length(cellSize), 1e-3), 0.0, 1.0);
}

// Star (SMPTE 128, 5-pointed): a polar "flower" boundary around the centre.
float starT(vec2 uv) {
  float radius = (0.65 + 0.35 * cos(5.0 * radialAngle(uv))) * 0.5 * length(resolution);
  return clamp(radialDistPx(uv) / max(radius, 1e-3), 0.0, 1.0);
}

// Stars, Replicate N×M (SMPTE 128 variant, paired with Star the same way
// Circles pairs with Circle): an N×M grid of independent star irises.
float starsReplicateT(vec2 uv, float replicateX, float replicateY) {
  vec2 n = max(floor(vec2(replicateX, replicateY)), 1.0);
  vec2 cellSize = resolution / n;
  vec2 cellPx = (fract(uv * n) - 0.5) * cellSize;
  float angle = atan(cellPx.y, cellPx.x);
  float radius = (0.65 + 0.35 * cos(5.0 * angle)) * 0.5 * length(cellSize);
  return clamp(length(cellPx) / max(radius, 1e-3), 0.0, 1.0);
}

// Heart (SMPTE 130): a cardioid-like polar boundary with its cusp pointing up.
float heartT(vec2 uv) {
  float angle = radialAngle(uv) + 1.57079632679;
  float radius = (0.75 - 0.6 * sin(angle)) * 0.5 * length(resolution);
  return clamp(radialDistPx(uv) / max(radius, 1e-3), 0.0, 1.0);
}

// Eye (SMPTE 122): a flattened, almond-like polar boundary - narrower at the
// top/bottom, fuller at the sides.
float eyeT(vec2 uv) {
  float radius = (0.35 + 0.65 * abs(cos(radialAngle(uv)))) * 0.5 * length(resolution);
  return clamp(radialDistPx(uv) / max(radius, 1e-3), 0.0, 1.0);
}

// Key Hole (SMPTE 131): the union (nearer of the two) of a small round "hole"
// above centre and the upward wedge (filledVT, apex at the bottom) beneath
// it, like a literal keyhole silhouette.
float keyHoleT(vec2 uv) {
  vec2 p = (uv - 0.5) * resolution;
  vec2 holeCentre = vec2(0.0, 0.15 * length(resolution));
  float hole = clamp(length(p - holeCentre) / max(0.55 * 0.5 * length(resolution), 1e-3), 0.0, 1.0);
  float neck = filledVT(uv, 90.0);
  return clamp(min(hole, neck), 0.0, 1.0);
}

// Angular sweep: the picture is divided into `spokes` equal pie slices (1 = a
// single clock-wipe sector, e.g. "Sweep Diagonal/Horizontal"; >1 = every
// slice opens in sync, e.g. the 4-spoke "Wheel"), each slice's own sweep
// starting at `startAngleDeg` and opening counter-clockwise.
float sweepT(vec2 uv, float startAngleDeg, float spokes) {
  float n = max(floor(spokes), 1.0);
  float sector = 6.28318530718 / n;
  float angle = radialAngle(uv) - radians(startAngleDeg);
  float local = mod(angle, sector);
  return clamp(local / sector, 0.0, 1.0);
}
