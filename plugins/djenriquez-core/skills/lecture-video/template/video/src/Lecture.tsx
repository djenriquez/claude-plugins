import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Background, C, SceneCtx } from "./lib";
import manifest from "./manifest.json";
import { SCENES } from "./scenes";

export const FPS = 30;

type Scene = { id: string; duration: number; beats: number[] };

// manifest.json is written by tts.py; stills.mjs repeats this frame math.
export const timeline = (manifest as Scene[]).reduce<{ id: string; from: number; dur: number; beats: number[] }[]>((acc, s) => {
  const from = acc.length ? acc[acc.length - 1].from + acc[acc.length - 1].dur : 0;
  acc.push({ id: s.id, from, dur: Math.ceil(s.duration * FPS), beats: s.beats.map((b) => Math.round(b * FPS)) });
  return acc;
}, []);

export const TOTAL = timeline[timeline.length - 1].from + timeline[timeline.length - 1].dur;

const ProgressBar: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, display: "flex", gap: 3 }}>
      {timeline.map((s) => {
        const p = Math.max(0, Math.min(1, (f - s.from) / s.dur));
        return (
          <div key={s.id} style={{ flex: s.dur, background: "#ffffff14", overflow: "hidden" }}>
            <div style={{ width: `${p * 100}%`, height: "100%", background: C.blue }} />
          </div>
        );
      })}
    </div>
  );
};

export const Lecture: React.FC = () => (
  <AbsoluteFill>
    <Background />
    {timeline.map((s) => {
      const Comp = SCENES[s.id];
      if (!Comp) throw new Error(`No component registered in scenes.tsx for scene "${s.id}"`);
      return (
        <Sequence key={s.id} from={s.from} durationInFrames={s.dur} name={s.id}>
          <SceneCtx.Provider value={{ beats: s.beats, dur: s.dur }}>
            <Audio src={staticFile(`audio/${s.id}.wav`)} />
            <Comp />
          </SceneCtx.Provider>
        </Sequence>
      );
    })}
    <ProgressBar />
  </AbsoluteFill>
);
