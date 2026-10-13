// QA filmstrip: one row per beat with its caption text and three frames (just
// after the sentence starts, mid-sentence, and just before the next one), so a
// single PNG shows whether each animation happens during its own sentence.
// Rendered by `node stills.mjs --strip <id>`.
import React from "react";
import { AbsoluteFill, Freeze } from "remotion";
import { sceneComponent, SceneHost, timeline, TimedScene } from "./Lecture";
import { Background, C, FONT, MONO } from "./lib";

const TW = 420;
const TH = Math.round((TW * 1080) / 1920);
const ROW = TH + 24;
const HEADER = 90;
const LABEL = 540;

export type StripProps = { id: string };

const find = (id: string): TimedScene => {
  const s = timeline.find((t) => t.id === id);
  if (!s) throw new Error(`unknown scene id "${id}"`);
  return s;
};

/** Strip size; its duration spans the scene because Remotion clamps frozen frames to the composition length. */
export const stripMetadata = (id: string) => {
  const s = find(id);
  return { height: HEADER + s.beatFrames.length * ROW + 24, durationInFrames: s.dur };
};

/** Frames sampled for beat i: just after it starts, its middle, and just before the next beat (or the fade-out). */
const samples = (s: TimedScene, i: number) => {
  const start = s.beatFrames[i];
  const end = i + 1 < s.beatFrames.length ? s.beatFrames[i + 1] - 2 : s.dur - 16;
  return [Math.min(start + 8, end), Math.round((start + end) / 2), end];
};

export const Strip: React.FC<StripProps> = ({ id }) => {
  const s = find(id);
  const Comp = sceneComponent(s);
  return (
    <AbsoluteFill style={{ background: "#05070f", fontFamily: FONT, color: C.text }}>
      <div style={{ position: "absolute", left: 40, top: 26, fontSize: 32, fontWeight: 700 }}>
        {s.id} <span style={{ color: C.dim, fontWeight: 400, fontSize: 24 }}>· {s.beatFrames.length} beats · {(s.dur / 30).toFixed(1)} s</span>
      </div>
      {s.beatFrames.map((_, i) => (
        <div key={i} style={{ position: "absolute", left: 40, top: HEADER + i * ROW, display: "flex", gap: 16 }}>
          <div style={{ width: LABEL - 16, height: TH, fontSize: 22, lineHeight: 1.35, overflow: "hidden" }}>
            <div style={{ fontFamily: MONO, color: C.blue, fontSize: 20, marginBottom: 6 }}>
              beat {i} · {s.beats[i].toFixed(1)} s
            </div>
            {s.text[i]}
          </div>
          {samples(s, i).map((frame) => (
            <div key={frame} style={{ position: "relative", width: TW, height: TH, overflow: "hidden", borderRadius: 8, border: `1px solid ${C.faint}` }}>
              <div style={{ width: 1920, height: 1080, transform: `scale(${TW / 1920})`, transformOrigin: "0 0" }}>
                <Freeze frame={frame}>
                  <AbsoluteFill>
                    <Background />
                    <SceneHost scene={s}>
                      <Comp />
                    </SceneHost>
                  </AbsoluteFill>
                </Freeze>
              </div>
              <div style={{ position: "absolute", right: 6, bottom: 4, fontFamily: MONO, fontSize: 16, color: C.dim }}>{(frame / 30).toFixed(1)} s</div>
            </div>
          ))}
        </div>
      ))}
    </AbsoluteFill>
  );
};
