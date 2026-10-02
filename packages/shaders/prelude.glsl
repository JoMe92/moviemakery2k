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
