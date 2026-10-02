import type { CSSProperties, ReactNode, SVGProps } from "react";

/*
 * Our own, deliberately simple geometric icons (16×16 grid). No tracings
 * of Windows or Movie Maker icons. Colours come from the theme tokens or
 * from currentColor.
 */

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
}

function Svg({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

const tok = (name: string): CSSProperties => ({ fill: `var(--y2k-${name})` });
const strokeTok = (name: string): CSSProperties => ({
  fill: "none",
  stroke: `var(--y2k-${name})`,
});

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
    </Svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="2.5" width="3" height="11" fill="currentColor" />
      <rect x="9.5" y="2.5" width="3" height="11" fill="currentColor" />
    </Svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="10" height="10" fill="currentColor" />
    </Svg>
  );
}

export function PrevIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="3" width="2" height="10" fill="currentColor" />
      <path d="M13 3v10L5 8z" fill="currentColor" />
    </Svg>
  );
}

export function NextIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 3v10l8-5z" fill="currentColor" />
      <rect x="11.5" y="3" width="2" height="10" fill="currentColor" />
    </Svg>
  );
}

export function ImportImageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect
        x="1.5"
        y="3.5"
        width="11"
        height="9"
        style={{ ...tok("pane"), stroke: "currentColor" }}
      />
      <path d="M2.5 11.5l3-4 2.5 3 1.5-1.5 2 2.5z" style={tok("icon-green")} />
      <circle cx="9.5" cy="6" r="1.2" style={tok("icon-yellow")} />
      <path d="M12 1.5v4M10 3.5l2 2 2-2" style={{ ...strokeTok("icon-blue"), strokeWidth: 1.5 }} />
    </Svg>
  );
}

export function TransitionsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect
        x="1.5"
        y="3.5"
        width="7"
        height="9"
        style={{ ...tok("icon-blue"), stroke: "currentColor" }}
      />
      <rect
        x="7.5"
        y="3.5"
        width="7"
        height="9"
        style={{ ...tok("icon-yellow"), stroke: "currentColor" }}
      />
      <path d="M8 3.5l-2 9h2.5z" style={tok("pane")} />
    </Svg>
  );
}

export function EffectsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M8 1.5l1.6 4.3 4.4.2-3.5 2.8 1.2 4.4L8 10.7l-3.7 2.5 1.2-4.4L2 6l4.4-.2z"
        fill="currentColor"
      />
    </Svg>
  );
}

export function TitleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M3 3h10v2.5h-1.2L11.5 4.5H8.8v8h1.4V14H5.8v-1.5h1.4v-8H4.5L4.2 5.5H3z"
        fill="currentColor"
      />
    </Svg>
  );
}

export function FilmIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" style={tok("icon-ink")} />
      <rect x="4.5" y="4.5" width="7" height="7" style={tok("icon-blue")} />
      {[3.5, 6.5, 9.5, 12.5].map((y) => (
        <g key={y} style={tok("pane")}>
          <rect x="2.3" y={y - 0.6} width="1.2" height="1.2" />
          <rect x="12.5" y={y - 0.6} width="1.2" height="1.2" />
        </g>
      ))}
    </Svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M1.5 4.5v8h13v-7H7.5l-1.5-1.5H2.5z"
        style={{ ...tok("icon-yellow"), stroke: "currentColor" }}
      />
    </Svg>
  );
}

export function ChevronIcon(props: IconProps & { direction?: "up" | "down" }) {
  const { direction = "up", ...rest } = props;
  const d = direction === "up" ? "M4 9.5l4-4 4 4M4 13l4-4 4 4" : "M4 3l4 4 4-4M4 6.5l4 4 4-4";
  return (
    <Svg {...rest}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" />
    </Svg>
  );
}

export function TimelineIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="3.5" width="13" height="3" fill="none" stroke="currentColor" />
      <rect x="1.5" y="9.5" width="9" height="3" fill="none" stroke="currentColor" />
    </Svg>
  );
}

/** Audio file: a beamed pair of eighth notes on a sheet (own drawing). */
export function AudioIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect
        x="1.5"
        y="1.5"
        width="13"
        height="13"
        rx="1"
        style={{ ...tok("pane"), stroke: "currentColor" }}
      />
      <path d="M6 11V4.5l6-1.5V9.5" style={{ ...strokeTok("icon-ink"), strokeWidth: 1.2 }} />
      <path d="M6 5.6l6-1.5" style={{ ...strokeTok("icon-ink"), strokeWidth: 1.6 }} />
      <ellipse cx="4.6" cy="11.2" rx="1.6" ry="1.2" style={tok("icon-blue")} />
      <ellipse cx="10.6" cy="9.7" rx="1.6" ry="1.2" style={tok("icon-blue")} />
    </Svg>
  );
}
