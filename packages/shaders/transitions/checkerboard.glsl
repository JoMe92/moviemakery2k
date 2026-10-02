// Schachbrett, quer (DXT CheckerBoard „Across“, Richtung rechts): Felder eines
// squaresX × squaresY-Rasters füllen sich von links nach rechts, jede zweite
// Reihe um ein halbes Feld versetzt.
uniform float squaresX;
uniform float squaresY;

vec4 transition(vec2 uv) {
  float row = floor(uv.y * squaresY);
  float offset = mod(row, 2.0) * 0.5;
  float fx = fract(uv.x * squaresX + offset);
  return fx < progress ? getToColor(uv) : getFromColor(uv);
}
