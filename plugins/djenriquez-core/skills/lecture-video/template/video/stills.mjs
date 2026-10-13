// Render QA images into stills/.
//
//   node stills.mjs                    every scene at half scale, just before its fade-out (settled layout)
//   node stills.mjs flow failure       only these scenes
//   node stills.mjs failure:2          2 s after beat 2 starts (an intermediate state)
//   node stills.mjs --strip            a filmstrip per scene: each beat's caption text beside three
//   node stills.mjs --strip flow       frames from that sentence, to check that motion lands on its sentence
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { checkIds, FPS, here, loadTimeline } from "./timeline.mjs";

const args = process.argv.slice(2);
const strip = args.includes("--strip");
const wanted = args
  .filter((a) => a !== "--strip")
  .map((arg) => {
    const [id, beat] = arg.split(":");
    return { id, beat: beat === undefined ? null : Number(beat) };
  });
const timeline = loadTimeline();
checkIds(
  timeline,
  wanted.map((w) => w.id),
);

const serveUrl = await bundle({ entryPoint: path.join(here, "src/index.ts") });
fs.mkdirSync(path.join(here, "stills"), { recursive: true });

if (strip) {
  const ids = wanted.length ? [...new Set(wanted.map((w) => w.id))] : timeline.map((s) => s.id);
  for (const id of ids) {
    const inputProps = { id };
    const composition = await selectComposition({ serveUrl, id: "Strip", inputProps });
    const output = path.join(here, "stills", `${id}-strip.png`);
    await renderStill({ serveUrl, composition, inputProps, frame: 0, output });
    console.log("strip", output);
  }
} else {
  const targets = [];
  for (const s of timeline) {
    const end = s.from + s.dur - 20;
    const beatFrame = (i) => s.from + s.beatFrames[Math.min(i, s.beatFrames.length - 1)];
    const requests = wanted.length ? wanted.filter((w) => w.id === s.id) : [{ id: s.id, beat: null }];
    for (const w of requests) {
      targets.push(
        w.beat === null
          ? { name: s.id, frame: end }
          : { name: `${s.id}-b${w.beat}`, frame: Math.min(end, beatFrame(w.beat) + 2 * FPS) },
      );
    }
  }
  const composition = await selectComposition({ serveUrl, id: "Lecture" });
  for (const t of targets) {
    const output = path.join(here, "stills", `${t.name}.png`);
    await renderStill({ serveUrl, composition, frame: t.frame, output, scale: 0.5 });
    console.log("still", output, "frame", t.frame);
  }
}
