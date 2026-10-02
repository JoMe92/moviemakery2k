/**
 * Selbst erzeugte Beispielbilder für die Übergangsdemo im Katalog
 * (Spec transitions „Übergänge in der Sammlung“): zwei Y2K-Karten „A“ und „B“.
 * Keine Assets; ohne Canvas-2D (jsdom) bleiben die Flächen leer.
 */
const WIDTH = 640;
const HEIGHT = 480;

interface Card {
  label: string;
  top: string;
  bottom: string;
  accent: string;
}

const CARDS: readonly [Card, Card] = [
  { label: "A", top: "#4a8cf7", bottom: "#0b3fae", accent: "#f2c84b" },
  { label: "B", top: "#ffd15c", bottom: "#e0661f", accent: "#2f9e37" },
];

function drawCard(card: Card): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, card.top);
  sky.addColorStop(1, card.bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Weiche Hügel und ein „Sonnen“-Kreis: genug Struktur, um Übergänge zu erkennen.
  ctx.fillStyle = card.accent;
  ctx.beginPath();
  ctx.arc(WIDTH * 0.78, HEIGHT * 0.28, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(WIDTH * (0.2 + i * 0.35), HEIGHT * 0.95, 260, 120 - i * 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.strokeRect(20, 20, WIDTH - 40, HEIGHT - 40);

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(0, 0, 40, 0.55)";
  ctx.lineWidth = 8;
  ctx.font = "bold 200px Tahoma, Verdana, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeText(card.label, WIDTH / 2, HEIGHT / 2);
  ctx.fillText(card.label, WIDTH / 2, HEIGHT / 2);
  return canvas;
}

let samples: [HTMLCanvasElement, HTMLCanvasElement] | null = null;

/** Beispielbilder A und B (einmal erzeugt). */
export function sampleImages(): [HTMLCanvasElement, HTMLCanvasElement] {
  samples ??= [drawCard(CARDS[0]), drawCard(CARDS[1])];
  return samples;
}
