// Render a short preview clip, with audio, covering the named scenes (and any
// scenes between them) so the user can judge look, voice, and pace early.
//
//   node preview.mjs intro flow     writes out/preview-intro-flow.mp4
import path from "node:path";
import { renderVideo } from "./renderer.mjs";
import { checkIds, here, loadTimeline } from "./timeline.mjs";

const ids = process.argv.slice(2);
if (!ids.length) throw new Error("usage: node preview.mjs <scene id> [<scene id> ...]");
const timeline = loadTimeline();
checkIds(timeline, ids);

const picked = timeline.filter((s) => ids.includes(s.id));
const first = picked[0].from;
const last = picked[picked.length - 1].from + picked[picked.length - 1].dur - 1;

await renderVideo({ timeline, first, last, output: path.join(here, "out", `preview-${ids.join("-")}.mp4`) });
