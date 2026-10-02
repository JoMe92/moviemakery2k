// Verpixeln (DXT Pixelate): bis zur Mitte immer gröbere Blöcke des Ausgangsbilds,
// dort Wechsel zum Zielbild, danach wieder scharf. maxSquare in Pixeln bei 640 px Breite.
uniform float maxSquare;

vec4 transition(vec2 uv) {
  float ramp = 1.0 - abs(2.0 * progress - 1.0);
  float size = max(1.0, floor(1.0 + (maxSquare * resolution.x / 640.0 - 1.0) * ramp + 0.5));
  // Abtastung in der Blockmitte; bei size 1 exakt die Pixelmitte.
  vec2 cell = (floor(uv * resolution / size) + 0.5) * size / resolution;
  vec2 sampleUv = size <= 1.0 ? uv : min(cell, vec2(1.0));
  return progress < 0.5 ? getFromColor(sampleUv) : getToColor(sampleUv);
}
