import { useLayoutEffect, useRef } from "react";
import catalog from "../../../../packages/catalog/transitions.json";
import type { DebugProgress } from "./debugProgress";
import { Renderer } from "./Renderer";

const WIDTH = 640;
const HEIGHT = 480;

function solid(color: string, width = WIDTH, height = HEIGHT): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
  }
  return c;
}

/** 300×600 portrait test image: gradient, border and diagonals to check the fit. */
function portraitPattern(): HTMLCanvasElement {
  const c = solid("#ffffff", 300, 600);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const g = ctx.createLinearGradient(0, 0, 0, 600);
  g.addColorStop(0, "#ff7a00");
  g.addColorStop(0.5, "#ffe14d");
  g.addColorStop(1, "#2fb0ff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 300, 600);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 292, 592);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(300, 600);
  ctx.moveTo(300, 0);
  ctx.lineTo(0, 600);
  ctx.stroke();
  ctx.fillStyle = "#1c3f94";
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("OBEN", 150, 60);
  ctx.fillText("UNTEN", 150, 570);
  return c;
}

function catalogParams(id: string): Record<string, number> {
  const entry = catalog.transitions.find((t) => t.id === id);
  return { ...((entry?.params ?? {}) as Record<string, number>) };
}

/** Tests only: draws exactly one frame and signals `body[data-debug-ready="1"]`. */
export default function DebugView({ spec }: { spec: DebugProgress }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const body = document.body.dataset;
    let renderer: Renderer;
    try {
      renderer = new Renderer(canvas, { preserveDrawingBuffer: true });
    } catch (err) {
      body.debugError = String(err);
      body.debugReady = "error";
      return;
    }
    renderer.resize(WIDTH, HEIGHT, 1);
    const from = renderer.createFrame(spec.fromPortrait ? portraitPattern() : solid(spec.from));
    const to = renderer.createFrame(solid(spec.to));
    renderer.drawTransition(
      from,
      to,
      spec.transitionId,
      spec.progress,
      catalogParams(spec.transitionId),
    );
    body.debugReady = "1";
    return () => {
      delete body.debugReady;
      renderer.dispose();
    };
  }, [spec]);

  return (
    <canvas
      id="mmy-debug-canvas"
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      style={{ position: "fixed", top: 0, left: 0, width: WIDTH, height: HEIGHT }}
    />
  );
}
