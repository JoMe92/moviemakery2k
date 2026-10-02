#version 300 es
// Rahmen vor jedem Übergangs-Shader (siehe README: Shader-Vertrag).
precision highp float;
precision highp int;

uniform sampler2D uFrom;
uniform sampler2D uTo;
// Fortschritt des Übergangs, 0.0 = nur Ausgangsbild, 1.0 = nur Zielbild.
uniform float progress;
// Ausgabegröße in Pixeln (Frame-Raum, 4:3).
uniform vec2 resolution;

in vec2 vUv;
out vec4 fragColor;

vec4 getFromColor(vec2 uv) { return texture(uFrom, uv); }
vec4 getToColor(vec2 uv) { return texture(uTo, uv); }
