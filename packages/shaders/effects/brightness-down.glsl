// Brightness −: subtracts a fixed amount from every channel.
uniform float amount;

vec4 effect(vec2 uv) {
  vec4 color = getColor(uv);
  return vec4(clamp(color.rgb - amount, 0.0, 1.0), color.a);
}
