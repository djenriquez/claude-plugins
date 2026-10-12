// Render QA stills at half scale into stills/.
//
//   node stills.mjs                 every scene, just before its fade-out (settled layout)
//   node stills.mjs flow failure    only these scenes
//   node stills.mjs failure:2       2 s after beat 2 starts (an intermediate state)
//
// Frame math must match Lecture.tsx: scene length = ceil(duration * FPS),
// beat frame = round(start * FPS).
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FPS = 30;
const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(here, "src/manifest.json"), "utf8"));

const wanted = process.argv.slice(2).map((arg) => {
  const [id, beat] = arg.split(":");
  return { id, beat: beat === undefined ? null : Number(beat) };
});
const unknown = wanted.filter((w) => !manifest.some((s) => s.id === w.id));
if (unknown.length) throw new Error(`unknown scene ids: ${unknown.map((w) => w.id).join(", ")}`);

const targets = [];
let from = 0;
for (const s of manifest) {
  const dur = Math.ceil(s.duration * FPS);
  const end = from + dur - 20;
  const beatFrame = (i) => from + Math.round(s.beats[Math.min(i, s.beats.length - 1)] * FPS);
  const requests = wanted.length ? wanted.filter((w) => w.id === s.id) : [{ id: s.id, beat: null }];
  for (const w of requests) {
    targets.push(
      w.beat === null
        ? { name: s.id, frame: end }
        : { name: `${s.id}-b${w.beat}`, frame: Math.min(end, beatFrame(w.beat) + 2 * FPS) },
    );
  }
  from += dur;
}

const serveUrl = await bundle({ entryPoint: path.join(here, "src/index.ts") });
const composition = await selectComposition({ serveUrl, id: "Lecture" });
fs.mkdirSync(path.join(here, "stills"), { recursive: true });
for (const t of targets) {
  const output = path.join(here, "stills", `${t.name}.png`);
  await renderStill({ serveUrl, composition, frame: t.frame, output, scale: 0.5 });
  console.log("still", output, "frame", t.frame);
}
