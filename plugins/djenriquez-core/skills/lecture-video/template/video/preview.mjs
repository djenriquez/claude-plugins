// Render a short preview clip, with audio, covering the named scenes (and any
// scenes between them) so the user can judge look, voice, and pace early.
//
//   node preview.mjs intro flow     writes out/preview-intro-flow.mp4
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { checkIds, FPS, here, loadTimeline } from "./timeline.mjs";

const ids = process.argv.slice(2);
if (!ids.length) throw new Error("usage: node preview.mjs <scene id> [<scene id> ...]");
const timeline = loadTimeline();
checkIds(timeline, ids);

const picked = timeline.filter((s) => ids.includes(s.id));
const first = picked[0].from;
const last = picked[picked.length - 1].from + picked[picked.length - 1].dur - 1;

const serveUrl = await bundle({ entryPoint: path.join(here, "src/index.ts") });
const composition = await selectComposition({ serveUrl, id: "Lecture" });
fs.mkdirSync(path.join(here, "out"), { recursive: true });
const outputLocation = path.join(here, "out", `preview-${ids.join("-")}.mp4`);
await renderMedia({ serveUrl, composition, codec: "h264", crf: 20, frameRange: [first, last], outputLocation });
console.log("preview", outputLocation, `${((last - first + 1) / FPS).toFixed(1)} s`);
