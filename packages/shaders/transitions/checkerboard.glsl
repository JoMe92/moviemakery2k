// Checkerboard, across (DXT CheckerBoard "Across", direction right): the cells of a
// squaresX × squaresY grid fill from left to right, every second row offset by
// half a cell.
uniform float squaresX;
uniform float squaresY;

vec4 transition(vec2 uv) {
  float row = floor(uv.y * squaresY);
  float offset = mod(row, 2.0) * 0.5;
  float fx = fract(uv.x * squaresX + offset);
  return fx < progress ? getToColor(uv) : getFromColor(uv);
}
