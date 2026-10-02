"""Checks the export's render environment (invocation: `pixi run check-render-env`).

1. moderngl creates a context without a display via EGL (design.md D1); on
   Linux the renderer must be Mesa llvmpipe from the Pixi environment.
2. A full-screen triangle without a vertex buffer using `#version 330 core` is
   rendered into an offscreen framebuffer and one pixel is read back (design.md D2).
3. FFmpeg provides the encoders `libx264` and `aac` (design.md D4, D8).

Exit code != 0 on any error.
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
        return [f"moderngl cannot be imported: {exc}"]

    try:
        ctx = moderngl.create_context(standalone=True, backend="egl")
    except Exception as exc:  # broad on purpose: glcontext only raises generic exceptions
        return [
            (
                f"EGL context failed: {exc}\n"
                "  Expected: Mesa llvmpipe from the Pixi environment (mesalib, linux-64 only);\n"
                "  __EGL_VENDOR_LIBRARY_DIRS and GLCONTEXT_LINUX_LIBEGL are set by pixi.toml."
            )
        ]

    renderer = ctx.info["GL_RENDERER"]
    print(f"GL_RENDERER: {renderer}")
    print(f"GL_VERSION:  {ctx.info['GL_VERSION']}")
    problems: list[str] = []
    if sys.platform.startswith("linux") and "llvmpipe" not in renderer:
        problems.append(f"Renderer is not llvmpipe: {renderer}")

    try:
        program = ctx.program(vertex_shader=VERTEX, fragment_shader=FRAGMENT)
        vao = ctx.vertex_array(program, [])
        fbo = ctx.simple_framebuffer((4, 4), components=4)
        fbo.use()
        fbo.clear(0.0, 0.0, 0.0, 0.0)
        vao.render(moderngl.TRIANGLES, vertices=3)
        pixel = tuple(fbo.read(viewport=(1, 1, 1, 1), components=4))
    except Exception as exc:  # broad on purpose: moderngl.Error and ctypes errors alike
        return [*problems, f"Rendering failed: {exc}"]
    finally:
        ctx.release()

    print(f"Pixel (1,1): {pixel}")
    if any(abs(a - b) > 1 for a, b in zip(pixel, EXPECTED_PIXEL, strict=True)):
        problems.append(f"Pixel {pixel} != expected {EXPECTED_PIXEL}")
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
        return ["ffmpeg not found"]
    if res.returncode != 0:
        return [f"ffmpeg -encoders failed:\n{res.stderr.strip()}"]
    names = {
        parts[1]
        for line in res.stdout.splitlines()
        if len(parts := line.split()) >= 2 and len(parts[0]) == 6
    }
    problems = []
    for encoder in ENCODERS:
        if encoder in names:
            print(f"FFmpeg encoder: {encoder}")
        else:
            problems.append(f"FFmpeg encoder missing: {encoder}")
    return problems


def main() -> int:
    problems = check_gl() + check_ffmpeg()
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return 1
    print("Render environment OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
