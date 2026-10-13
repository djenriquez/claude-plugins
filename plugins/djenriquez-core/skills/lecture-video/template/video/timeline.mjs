// Scene frame ranges for the Node scripts. Must match Lecture.tsx:
// scene length = ceil(duration * FPS), beat frame = round(start * FPS).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FPS = 30;
export const here = path.dirname(fileURLToPath(import.meta.url));

export const loadTimeline = () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(here, "src/manifest.json"), "utf8"));
  let from = 0;
  return manifest.scenes.map((s) => {
    const dur = Math.ceil(s.duration * FPS);
    const entry = { id: s.id, from, dur, beatFrames: s.beats.map((b) => Math.round(b * FPS)) };
    from += dur;
    return entry;
  });
};

/** Throws on ids missing from the manifest. */
export const checkIds = (timeline, ids) => {
  const unknown = ids.filter((id) => !timeline.some((s) => s.id === id));
  if (unknown.length) throw new Error(`unknown scene ids: ${unknown.join(", ")}`);
};
