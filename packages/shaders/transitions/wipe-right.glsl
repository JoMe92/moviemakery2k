// Wischen, rechts: eine senkrechte, weiche Kante wandert von links nach rechts.
// gradientSize = Breite des Verlaufs als Anteil der Bildbreite (WMM: 0.5 „Normal“).
uniform float gradientSize;

vec4 transition(vec2 uv) {
  float g = max(gradientSize, 1e-4);
  // Kante läuft von -g bis 1, damit Rand 0 und 1 exakt rein sind.
  float w = clamp((progress * (1.0 + g) - uv.x) / g, 0.0, 1.0);
  return mix(getFromColor(uv), getToColor(uv), w);
}
