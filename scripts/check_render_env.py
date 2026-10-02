"""Prüft die Render-Umgebung des Exports (Aufruf: `pixi run check-render-env`).

1. moderngl erzeugt über EGL einen Kontext ohne Display (design.md D1); unter
   Linux muss der Renderer Mesa llvmpipe aus der Pixi-Umgebung sein.
2. Ein Vollbild-Dreieck ohne Vertex-Buffer mit `#version 330 core` wird in ein
   Offscreen-Framebuffer gerendert und ein Pixel zurückgelesen (design.md D2).
3. FFmpeg bietet die Encoder `libx264` und `aac` (design.md D4, D8).

Exit-Code != 0 bei jedem Fehler.
"""

import subprocess
import sys

VERTEX = """#version 330 core
out vec2 v_uv;
void main() {
    vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    v_uv = pos;
    gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
"""

FRAGMENT = """#version 330 core
precision highp float;
in vec2 v_uv;
out vec4 outColor;
void main() {
    outColor = vec4(1.0, 0.5, 0.0, 1.0);
}
"""

EXPECTED_PIXEL = (255, 128, 0, 255)
ENCODERS = ("libx264", "aac")


def check_gl() -> list[str]:
    try:
        import moderngl
    except ImportError as exc:
        return [f"moderngl nicht importierbar: {exc}"]

    try:
        ctx = moderngl.create_context(standalone=True, backend="egl")
    except Exception as exc:  # noqa: BLE001 – glcontext wirft nur generische Exceptions
        return [
            (
                f"EGL-Kontext fehlgeschlagen: {exc}\n"
                "  Erwartet: Mesa llvmpipe aus der Pixi-Umgebung (mesalib, nur linux-64);\n"
                "  __EGL_VENDOR_LIBRARY_DIRS und GLCONTEXT_LINUX_LIBEGL setzt pixi.toml."
            )
        ]

    renderer = ctx.info["GL_RENDERER"]
    print(f"GL_RENDERER: {renderer}")
    print(f"GL_VERSION:  {ctx.info['GL_VERSION']}")
    problems: list[str] = []
    if sys.platform.startswith("linux") and "llvmpipe" not in renderer:
        problems.append(f"Renderer ist nicht llvmpipe: {renderer}")

    try:
        program = ctx.program(vertex_shader=VERTEX, fragment_shader=FRAGMENT)
        vao = ctx.vertex_array(program, [])
        fbo = ctx.simple_framebuffer((4, 4), components=4)
        fbo.use()
        fbo.clear(0.0, 0.0, 0.0, 0.0)
        vao.render(moderngl.TRIANGLES, vertices=3)
        pixel = tuple(fbo.read(viewport=(1, 1, 1, 1), components=4))
    except Exception as exc:  # noqa: BLE001 – moderngl.Error und ctypes-Fehler gleichermaßen
        return [*problems, f"Rendern fehlgeschlagen: {exc}"]
    finally:
        ctx.release()

    print(f"Pixel (1,1): {pixel}")
    if any(abs(a - b) > 1 for a, b in zip(pixel, EXPECTED_PIXEL, strict=True)):
        problems.append(f"Pixel {pixel} != erwartet {EXPECTED_PIXEL}")
    return problems


def check_ffmpeg() -> list[str]:
    try:
        res = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        return ["ffmpeg nicht gefunden"]
    if res.returncode != 0:
        return [f"ffmpeg -encoders fehlgeschlagen:\n{res.stderr.strip()}"]
    names = {
        parts[1]
        for line in res.stdout.splitlines()
        if len(parts := line.split()) >= 2 and len(parts[0]) == 6
    }
    problems = []
    for encoder in ENCODERS:
        if encoder in names:
            print(f"FFmpeg-Encoder: {encoder}")
        else:
            problems.append(f"FFmpeg-Encoder fehlt: {encoder}")
    return problems


def main() -> int:
    problems = check_gl() + check_ffmpeg()
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return 1
    print("Render-Umgebung OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
