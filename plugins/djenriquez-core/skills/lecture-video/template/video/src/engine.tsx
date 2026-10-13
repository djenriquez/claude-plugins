// Frame primitives for the lecture. Every component is a pure function of the
// current frame, so render.mjs can draw any frame, in any order, in several
// browser pages at once. Scenes use these through lib.tsx's useScene().
import React, { createContext, useContext } from "react";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

const FrameCtx = createContext(0);

/** Frame number relative to the enclosing Sequence (or the composition). */
export const useCurrentFrame = () => useContext(FrameCtx);

/** Sets the frame for everything inside it; index.tsx and Strip.tsx use it to pick a frame. */
export const Freeze: React.FC<{ frame: number; children: React.ReactNode }> = ({ frame, children }) => (
  <FrameCtx.Provider value={frame}>{children}</FrameCtx.Provider>
);

/** Shows its children only during [from, from + durationInFrames), with frames counted from `from`. */
export const Sequence: React.FC<{ from: number; durationInFrames: number; children: React.ReactNode }> = ({
  from,
  durationInFrames,
  children,
}) => {
  const f = useCurrentFrame() - from;
  return f < 0 || f >= durationInFrames ? null : <Freeze frame={f}>{children}</Freeze>;
};

/** Full-size absolutely positioned layer (a flex column). */
export const AbsoluteFill: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode }> = ({ style, children }) => (
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", ...style }}>
    {children}
  </div>
);

type Extrapolate = "extend" | "clamp";

/**
 * Maps x through a piecewise-linear curve from `input` (ascending) to `output`.
 * Outside the input range it extends the end segments unless told to clamp.
 */
export const interpolate = (
  x: number,
  input: number[],
  output: number[],
  opts: { extrapolateLeft?: Extrapolate; extrapolateRight?: Extrapolate; easing?: (t: number) => number } = {},
) => {
  let i = 1;
  while (i < input.length - 1 && x > input[i]) i++;
  let t = (x - input[i - 1]) / (input[i] - input[i - 1]);
  if (t < 0 && opts.extrapolateLeft === "clamp") t = 0;
  if (t > 1 && opts.extrapolateRight === "clamp") t = 1;
  if (opts.easing) t = opts.easing(t);
  return output[i - 1] + (output[i] - output[i - 1]) * t;
};

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Damped spring from 0 toward 1, starting at frame 0 (0 before it). Damping at
 * or above critical follows the critically damped curve, so large damping gives
 * a quick ease with no overshoot; low damping overshoots and settles.
 */
export const spring = (frame: number, { damping = 10, mass = 1, stiffness = 100 } = {}) => {
  if (frame <= 0) return 0;
  const t = frame / FPS;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta >= 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
};
