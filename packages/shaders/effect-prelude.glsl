#version 300 es
// Frame placed before every effect shader (see README: Effect shader contract).
precision highp float;
precision highp int;

uniform sampler2D uImage;
// Output size in pixels (frame space, 4:3).
uniform vec2 resolution;

in vec2 vUv;
out vec4 fragColor;

vec4 getColor(vec2 uv) { return texture(uImage, uv); }
