// Render the full lecture with audio to out/lecture.mp4.
//
//   node render.mjs [--concurrency N] [--crf N]
import path from "node:path";
import { defaultConcurrency, flag, renderVideo } from "./renderer.mjs";
import { here, loadTimeline } from "./timeline.mjs";

const args = process.argv.slice(2);
const timeline = loadTimeline();
const end = timeline[timeline.length - 1];
await renderVideo({
  timeline,
  first: 0,
  last: end.from + end.dur - 1,
  output: path.join(here, "out", "lecture.mp4"),
  concurrency: flag(args, "--concurrency", defaultConcurrency()),
  crf: flag(args, "--crf", 20),
});
