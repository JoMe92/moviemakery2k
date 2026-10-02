// Überblenden: lineare Mischung ohne Zwischenschwarz (DXT Fade, Overlap 1.0).
vec4 transition(vec2 uv) {
  return mix(getFromColor(uv), getToColor(uv), progress);
}
