import { type ReactNode, useId } from "react";

/*
 * Custom schematic preview icons for the transitions: image A (blue) turns into
 * image B (yellow). No original assets; colours come from the theme tokens.
 */
const A = "var(--y2k-icon-blue)";
const B = "var(--y2k-icon-yellow)";

export interface TransitionIconProps {
  transitionId: string;
  /** Width in pixels; height at a 4:3 ratio. */
  size?: number;
}

function Frame({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={(size * 3) / 4}
      viewBox="0 0 40 30"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      {children}
      <rect
        x="0.5"
        y="0.5"
        width="39"
        height="29"
        fill="none"
        style={{ stroke: "var(--y2k-icon-ink)" }}
      />
    </svg>
  );
}

// Fixed pseudo-random patterns (deterministic).
const DISSOLVE = [3, 7, 12, 18, 21, 26, 30, 35, 38, 44, 47, 51, 56, 60, 63, 69, 72, 77];
const PIXEL_LEVELS = [0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1];

export function TransitionIcon({ transitionId, size = 40 }: TransitionIconProps) {
  const gradientId = useId();
  switch (transitionId) {
    case "fade":
      return (
        <Frame size={size}>
          <defs>
            <linearGradient id={gradientId}>
              <stop offset="0" style={{ stopColor: A }} />
              <stop offset="1" style={{ stopColor: B }} />
            </linearGradient>
          </defs>
          <rect width="40" height="30" fill={`url(#${gradientId})`} />
        </Frame>
      );
    case "dissolve":
      return (
        <Frame size={size}>
          <rect width="40" height="30" style={{ fill: A }} />
          {DISSOLVE.map((n) => (
            <rect
              key={n}
              x={(n * 5) % 40}
              y={Math.floor(n / 8) * 3}
              width="5"
              height="3"
              style={{ fill: B }}
            />
          ))}
        </Frame>
      );
    case "wipe-right":
      return (
        <Frame size={size}>
          <rect width="40" height="30" style={{ fill: A }} />
          <rect width="22" height="30" style={{ fill: B }} />
          <path d="M24 15h10m-3-3 3 3-3 3" fill="none" style={{ stroke: "var(--y2k-icon-ink)" }} />
        </Frame>
      );
    case "circle":
      return (
        <Frame size={size}>
          <rect width="40" height="30" style={{ fill: A }} />
          <circle cx="20" cy="15" r="10" style={{ fill: B }} />
        </Frame>
      );
    case "pixelate":
      return (
        <Frame size={size}>
          {PIXEL_LEVELS.map((level, i) => (
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed grid
              key={i}
              x={(i % 4) * 10}
              y={Math.floor(i / 4) * 10}
              width="10"
              height="10"
              style={{ fill: level ? B : A }}
            />
          ))}
        </Frame>
      );
    case "checkerboard":
      return (
        <Frame size={size}>
          <rect width="40" height="30" style={{ fill: A }} />
          {Array.from({ length: 12 }, (_, i) => i)
            .filter((i) => (i % 4) % 2 === Math.floor(i / 4) % 2)
            .map((i) => (
              <rect
                key={i}
                x={(i % 4) * 10}
                y={Math.floor(i / 4) * 10}
                width="10"
                height="10"
                style={{ fill: B }}
              />
            ))}
        </Frame>
      );
    default:
      return (
        <Frame size={size}>
          <rect width="20" height="30" style={{ fill: A }} />
          <rect x="20" width="20" height="30" style={{ fill: B }} />
        </Frame>
      );
  }
}
