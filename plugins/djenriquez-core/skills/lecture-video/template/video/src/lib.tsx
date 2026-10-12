// Animation library for beat-synced lecture scenes.
//
// Canvas is 1920x1080. Scenes position elements absolutely in canvas pixels.
// SceneFrame's title occupies roughly y 70-200; keep content inside x 110-1810,
// y 240-1000, and above y 920 when the scene uses a Caption.
//
// Every visual change keys off a beat index through useScene(), never off
// hard-coded seconds, so re-running tts.py re-times the whole video.
import React, { createContext, useContext } from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const C = {
  bg: "#0a0f1e",
  text: "#eef2fa",
  dim: "#93a3c0",
  faint: "#3a4a6b",
  blue: "#5aa9ff",
  violet: "#a78bfa",
  green: "#34d399",
  amber: "#fbbf24",
  red: "#f87171",
  pink: "#f472b6",
  cyan: "#22d3ee",
};

export const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif';
export const MONO = '"SF Mono", Menlo, monospace';

// ---------- scene timing context ----------

type SceneInfo = { beats: number[]; dur: number };
export const SceneCtx = createContext<SceneInfo>({ beats: [], dur: 1 });

export const useScene = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { beats, dur } = useContext(SceneCtx);
  /** Frame (scene-relative) where beat i starts; clamps to the last beat. */
  const B = (i: number) => beats[Math.min(i, beats.length - 1)] ?? 0;
  /** Smooth spring 0→1 starting at beat i (+ delay frames). */
  const at = (i: number, delay = 0, damping = 200) =>
    spring({ frame: f - B(i) - delay, fps, config: { damping, mass: 0.7 } });
  /** Bouncy spring that overshoots; use for scale-in pops. */
  const pop = (i: number, delay = 0) => spring({ frame: f - B(i) - delay, fps, config: { damping: 12, mass: 0.6 } });
  /** Eased progress 0→1 over `len` frames from beat i (+ delay). Drives arrows and packets. */
  const lin = (i: number, len: number, delay = 0) =>
    interpolate(f, [B(i) + delay, B(i) + delay + len], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    });
  /** True once beat i (+ delay) has started. */
  const after = (i: number, delay = 0) => f >= B(i) + delay;
  /** Index of the latest beat that has started (0 before the first). */
  const beat = () => beats.reduce((cur, b, i) => (f >= b ? i : cur), 0);
  /** Horizontal shake in px while `on`, decaying over ~18 frames after beat i. */
  const shake = (on: boolean, i: number, px = 6) => (on ? Math.sin(f * 1.6) * px * (1 - at(i, 18)) : 0);
  return { f, fps, B, at, pop, lin, after, beat, shake, dur };
};

// ---------- global background ----------

export const Background: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const blob = (x: number, y: number, r: number, color: string, phase: number) => (
    <div
      style={{
        position: "absolute",
        left: x + Math.sin(t * 0.13 + phase) * 140,
        top: y + Math.cos(t * 0.11 + phase) * 100,
        width: r,
        height: r,
        borderRadius: "50%",
        background: color,
        filter: "blur(120px)",
        opacity: 0.32,
      }}
    />
  );
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      {blob(-200, -250, 900, "#1d4ed8", 0)}
      {blob(1250, 450, 850, "#7c3aed", 2)}
      {blob(500, 750, 700, "#0e7490", 4)}
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(140,170,230,0.16) 1.5px, transparent 1.5px)",
          backgroundSize: "44px 44px",
          backgroundPosition: `${(t * 6) % 44}px ${(t * 3) % 44}px`,
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 85%)",
        }}
      />
    </AbsoluteFill>
  );
};

// ---------- scene chrome ----------

/** Fades the scene in and out and draws the optional kicker + title. */
export const SceneFrame: React.FC<{
  kicker?: string;
  title?: string;
  children: React.ReactNode;
}> = ({ kicker, title, children }) => {
  const { f, fps, dur } = useScene();
  const fadeIn = interpolate(f, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(f, [dur - 14, dur], [1, 0], { extrapolateLeft: "clamp" });
  const tIn = spring({ frame: f - 2, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut), fontFamily: FONT, color: C.text }}>
      {title && (
        <div style={{ position: "absolute", left: 110, top: 70, transform: `translateY(${(1 - tIn) * 30}px)`, opacity: tIn }}>
          {kicker && (
            <div style={{ fontSize: 26, letterSpacing: 4, textTransform: "uppercase", color: C.blue, fontWeight: 700, marginBottom: 10 }}>
              {kicker}
            </div>
          )}
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>{title}</div>
        </div>
      )}
      {children}
    </AbsoluteFill>
  );
};

// ---------- primitives ----------

type Pos = { x: number; y: number; w?: number; h?: number };

/** Absolutely positioned, spring-revealed element. Pass p = at(beat). */
export const Reveal: React.FC<
  Pos & { p: number; from?: "up" | "down" | "left" | "right" | "scale"; style?: React.CSSProperties; children: React.ReactNode }
> = ({ x, y, w, h, p, from = "up", style, children }) => {
  const d = (1 - p) * 40;
  const tf =
    from === "up"
      ? `translateY(${d}px)`
      : from === "down"
        ? `translateY(${-d}px)`
        : from === "left"
          ? `translateX(${-d}px)`
          : from === "right"
            ? `translateX(${d}px)`
            : `scale(${0.6 + 0.4 * p})`;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, opacity: Math.min(1, p * 1.4), transform: tf, ...style }}>
      {children}
    </div>
  );
};

/** Glassy bordered panel. Fills its parent; wrap it in a sized Reveal or div. */
export const Card: React.FC<{
  color?: string;
  title?: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  glow?: number;
  center?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ color = C.blue, title, sub, icon, glow = 0, center, style, children }) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      borderRadius: 22,
      border: `2px solid ${color}`,
      background: `linear-gradient(160deg, ${color}26, ${color}0d)`,
      boxShadow: `0 0 ${20 + glow * 50}px ${color}${glow > 0 ? "77" : "22"}`,
      padding: "22px 26px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: center ? "center" : "flex-start",
      textAlign: center ? "center" : "left",
      gap: 8,
      backdropFilter: "blur(6px)",
      ...style,
    }}
  >
    {icon}
    {title && <div style={{ fontSize: 34, fontWeight: 750, color: "#fff", lineHeight: 1.15 }}>{title}</div>}
    {sub && <div style={{ fontSize: 24, color: C.dim, lineHeight: 1.35 }}>{sub}</div>}
    {children}
  </div>
);

/** Rounded label. Never wraps, so long text runs off the canvas: check stills. */
export const Pill: React.FC<{ color?: string; children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({
  color = C.blue,
  children,
  size = 26,
  style,
}) => (
  <span
    style={{
      display: "inline-block",
      padding: `${size * 0.25}px ${size * 0.7}px`,
      borderRadius: 999,
      background: `${color}22`,
      border: `2px solid ${color}`,
      color: "#fff",
      fontSize: size,
      fontWeight: 650,
      fontFamily: FONT,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </span>
);

/** Full-canvas SVG layer for arrows and packets. Defines one arrowhead per palette colour. */
export const Svg: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
    <defs>
      {Object.entries(C).map(([k, v]) => (
        <marker key={k} id={`head-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={v} />
        </marker>
      ))}
    </defs>
    {children}
  </svg>
);

// Arrowheads exist only for palette colours; any other colour gets a blue head.
const colorKey = (color: string) => Object.entries(C).find(([, v]) => v === color)?.[0] ?? "blue";

type Pt = [number, number];

/** Arrow along a polyline, drawn progressively (p: 0→1, usually lin(beat, frames)). Must be inside <Svg>. */
export const Arrow: React.FC<{
  pts: Pt[];
  p: number;
  color?: string;
  dashed?: boolean;
  width?: number;
  label?: string;
  labelAt?: Pt;
}> = ({ pts, p, color = C.blue, dashed, width = 4, label, labelAt }) => {
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" ");
  const len = pts.slice(1).reduce((s, [x, y], i) => s + Math.hypot(x - pts[i][0], y - pts[i][1]), 0);
  if (p <= 0) return null;
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dashed ? `14 12` : `${len} ${len}`}
        strokeDashoffset={dashed ? 0 : len * (1 - p)}
        opacity={dashed ? p : 1}
        markerEnd={p > 0.97 ? `url(#head-${colorKey(color)})` : undefined}
      />
      {label && labelAt && (
        <text x={labelAt[0]} y={labelAt[1]} fill={color} fontSize={24} fontWeight={650} fontFamily={FONT} textAnchor="middle" opacity={Math.max(0, p * 2 - 1)}>
          {label}
        </text>
      )}
    </g>
  );
};

/** Point along a polyline at fraction t (by length). */
export const along = (pts: Pt[], t: number): Pt => {
  const segs = pts.slice(1).map(([x, y], i) => Math.hypot(x - pts[i][0], y - pts[i][1]));
  const total = segs.reduce((a, b) => a + b, 0);
  let dist = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i] || i === segs.length - 1) {
      const r = segs[i] ? dist / segs[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r];
    }
    dist -= segs[i];
  }
  return pts[pts.length - 1];
};

/** Glowing dot travelling along a polyline; hidden at t <= 0 and t >= 1. Must be inside <Svg>. */
export const Packet: React.FC<{ pts: Pt[]; t: number; color?: string; r?: number }> = ({ pts, t, color = C.amber, r = 13 }) => {
  if (t <= 0 || t >= 1) return null;
  const [x, y] = along(pts, t);
  return (
    <g>
      <circle cx={x} cy={y} r={r * 2.4} fill={color} opacity={0.18} />
      <circle cx={x} cy={y} r={r} fill={color} />
    </g>
  );
};

/** Caption strip near the bottom of the frame (occupies roughly y 930-1010). */
export const Caption: React.FC<{ p: number; children: React.ReactNode; color?: string }> = ({ p, children, color = C.blue }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 70,
      display: "flex",
      justifyContent: "center",
      opacity: p,
      transform: `translateY(${(1 - p) * 20}px)`,
    }}
  >
    <div
      style={{
        fontSize: 36,
        fontWeight: 650,
        padding: "16px 40px",
        borderRadius: 18,
        background: "rgba(10,15,30,0.75)",
        border: `2px solid ${color}`,
        boxShadow: `0 0 40px ${color}44`,
      }}
    >
      {children}
    </div>
  </div>
);

// ---------- icons (24x24 stroke icons) ----------

export const Icon: React.FC<{ name: string; size?: number; color?: string }> = ({ name, size = 56, color = "#fff" }) => {
  const s = { width: size, height: size, fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "terminal":
      return <svg viewBox="0 0 24 24" {...s}><rect x="2" y="4" width="20" height="16" rx="3" /><path d="M6 9l3 3-3 3M12 15h5" /></svg>;
    case "play":
      return <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="10" /><path d="M10 8l6 4-6 4z" /></svg>;
    case "nodes":
      return <svg viewBox="0 0 24 24" {...s}><circle cx="5" cy="6" r="2.5" /><circle cx="19" cy="6" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M7.5 6h9M7.5 18h9M5 8.5v7M19 8.5v7" /></svg>;
    case "server":
      return <svg viewBox="0 0 24 24" {...s}><rect x="3" y="3" width="18" height="7" rx="2" /><rect x="3" y="14" width="18" height="7" rx="2" /><path d="M7 6.5h.01M7 17.5h.01" /></svg>;
    case "db":
      return <svg viewBox="0 0 24 24" {...s}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>;
    case "shield":
      return <svg viewBox="0 0 24 24" {...s}><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" /><path d="M9 12l2 2 4-4" /></svg>;
    case "globe":
      return <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20" /></svg>;
    case "key":
      return <svg viewBox="0 0 24 24" {...s}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3" /></svg>;
    case "lock":
      return <svg viewBox="0 0 24 24" {...s}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>;
    case "check":
      return <svg viewBox="0 0 24 24" {...s}><path d="M5 12l5 5L20 7" /></svg>;
    case "x":
      return <svg viewBox="0 0 24 24" {...s}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case "gpu":
      return <svg viewBox="0 0 24 24" {...s}><rect x="3" y="6" width="18" height="12" rx="2" /><rect x="7" y="9" width="10" height="6" rx="1" /><path d="M6 3v3M10 3v3M14 3v3M18 3v3M6 18v3M10 18v3M14 18v3M18 18v3" /></svg>;
    case "cloud":
      return <svg viewBox="0 0 24 24" {...s}><path d="M7 18a5 5 0 01-.5-10A6 6 0 0118 9a4.5 4.5 0 01-.5 9z" /></svg>;
    case "clock":
      return <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>;
    case "bolt":
      return <svg viewBox="0 0 24 24" {...s}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>;
    case "user":
      return <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
    case "box":
      return <svg viewBox="0 0 24 24" {...s}><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" /></svg>;
    case "doc":
      return <svg viewBox="0 0 24 24" {...s}><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6M9 13h8M9 17h6" /></svg>;
    case "card":
      return <svg viewBox="0 0 24 24" {...s}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>;
    default:
      return null;
  }
};
