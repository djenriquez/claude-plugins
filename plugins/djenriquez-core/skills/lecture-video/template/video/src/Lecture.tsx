import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Background, C, SceneCtx } from "./lib";
import manifest from "./manifest.json";
import { SCENES } from "./scenes";

export const FPS = 30;

type Scene = {
  id: string;
  title?: string | null;
  source?: string | null;
  duration: number;
  beats: number[];
  ends: number[];
  text: string[];
};
type Manifest = { voice: string; speed: number; scenes: Scene[] };

const m = manifest as unknown as Manifest;
export const VOICE = m.voice;

export type TimedScene = Scene & { from: number; dur: number; beatFrames: number[] };

// manifest.json is written by tts.py. Frame math here is repeated in timeline.mjs
// (stills, previews) and tts.py (captions, chapters): scene length =
// ceil(duration * FPS), beat frame = round(start * FPS).
export const timeline = m.scenes.reduce<TimedScene[]>((acc, s) => {
  const from = acc.length ? acc[acc.length - 1].from + acc[acc.length - 1].dur : 0;
  acc.push({ ...s, from, dur: Math.ceil(s.duration * FPS), beatFrames: s.beats.map((b) => Math.round(b * FPS)) });
  return acc;
}, []);

export const TOTAL = timeline[timeline.length - 1].from + timeline[timeline.length - 1].dur;

/** The registered component for a scene, after checking it was animated for this narration's beat count. */
export const sceneComponent = (s: Scene): React.FC => {
  const def = SCENES[s.id];
  if (!def) throw new Error(`No component registered in scenes.tsx for scene "${s.id}"`);
  if (def.beats !== s.beats.length) {
    throw new Error(
      `Scene "${s.id}" is animated for ${def.beats} beats but its narration has ${s.beats.length}. ` +
        "Re-key the component's at()/lin()/after() calls to the new sentences, then update its beat count in scenes.tsx.",
    );
  }
  return def.component;
};

/** Runs one scene with its beat timing; used by the lecture and the QA filmstrip. */
export const SceneHost: React.FC<{ scene: TimedScene; children: React.ReactNode }> = ({ scene, children }) => (
  <SceneCtx.Provider value={{ beats: scene.beatFrames, dur: scene.dur, source: scene.source, voice: VOICE }}>{children}</SceneCtx.Provider>
);

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
      const Comp = sceneComponent(s);
      return (
        <Sequence key={s.id} from={s.from} durationInFrames={s.dur} name={s.id}>
          <SceneHost scene={s}>
            <Audio src={staticFile(`audio/${s.id}.wav`)} />
            <Comp />
          </SceneHost>
        </Sequence>
      );
    })}
    <ProgressBar />
  </AbsoluteFill>
);
