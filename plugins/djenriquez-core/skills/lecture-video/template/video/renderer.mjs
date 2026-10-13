// Renders the compositions in src/ without a video framework: esbuild bundles
// src/index.tsx into dist/, Puppeteer opens it in headless Chrome, each frame is
// drawn through window.lecture and screenshotted, and ffmpeg encodes the frames
// with the scenes' narration WAVs laid end to end. Used by render.mjs,
// preview.mjs, and stills.mjs.
import esbuild from "esbuild";
import ffmpegPath from "ffmpeg-static";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer";
import { FPS, here } from "./timeline.mjs";

/** Bundles src/ into dist/ and returns the page URL. */
export const bundle = async () => {
  const dist = path.join(here, "dist");
  fs.rmSync(dist, { recursive: true, force: true });
  await esbuild.build({
    entryPoints: [path.join(here, "src/index.tsx")],
    bundle: true,
    outdir: dist,
    format: "iife",
    jsx: "automatic",
    loader: { ".woff2": "dataurl", ".woff": "dataurl" },
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
  });
  const html = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="index.css"><body style="margin:0"><div id="root"></div><script src="index.js"></script>';
  fs.writeFileSync(path.join(dist, "index.html"), html);
  return pathToFileURL(path.join(dist, "index.html")).href;
};

/**
 * Runs fn with `count` headless browsers and closes them afterwards. Video
 * renders use one browser per worker: pages in a single browser share its
 * compositor, which tops out near 50 frames per second however many pages draw.
 */
export const withBrowsers = async (count, fn) => {
  const browsers = await Promise.all(Array.from({ length: count }, () => puppeteer.launch({ headless: "shell" })));
  try {
    return await fn(browsers);
  } finally {
    await Promise.all(browsers.map((b) => b.close()));
  }
};

export const withBrowser = (fn) => withBrowsers(1, ([browser]) => fn(browser));

/** Opens one composition; resolves to { page, width, height, frames, show(n) }. */
export const openComposition = async (browser, url, query, scale = 1) => {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${url}?${new URLSearchParams(query)}`);
  await page.waitForFunction(() => window.lecture || window.lectureError, { timeout: 60_000 });
  const meta = await page.evaluate(() => (window.lecture ? { ...window.lecture } : { error: window.lectureError }));
  if (meta.error || errors.length) throw new Error([meta.error, ...errors].filter(Boolean).join("\n"));
  await page.setViewport({ width: meta.width, height: meta.height, deviceScaleFactor: scale });
  const show = (n) => page.evaluate((frame) => window.lecture.frame(frame), n);
  return { page, width: meta.width, height: meta.height, frames: meta.frames, show };
};

/** Writes one PNG frame. */
export const renderStill = async (comp, frame, output) => {
  await comp.show(frame);
  await comp.page.screenshot({ path: output, type: "png" });
};

/** The Lecture's audio for frames [first, last]: each scene's WAV, padded with silence to its length. */
const audioArgs = (timeline, first, last) => {
  const scenes = timeline.filter((s) => s.from + s.dur > first && s.from <= last);
  const inputs = scenes.flatMap((s) => {
    const wav = path.join(here, "public/audio", `${s.id}.wav`);
    if (!fs.existsSync(wav)) throw new Error(`missing ${wav}: run tts.py (or tts.py --only ${s.id})`);
    return ["-i", wav];
  });
  const pads = scenes.map((s, i) => `[${i + 1}:a]apad=whole_dur=${s.dur / FPS}[a${i}]`);
  const join = `${scenes.map((_, i) => `[a${i}]`).join("")}concat=n=${scenes.length}:v=0:a=1`;
  const trim = `atrim=start=${(first - scenes[0].from) / FPS}:duration=${(last - first + 1) / FPS},asetpts=PTS-STARTPTS[aout]`;
  return { inputs, filter: [...pads, `${join},${trim}`].join(";") };
};

const ffmpeg = (args, stdio) => {
  const proc = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio });
  const exit = once(proc, "close").then(([code]) => {
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
  });
  return { proc, exit };
};

/**
 * Renders Lecture frames [first, last] with audio to an H.264/AAC MP4.
 * Frames are drawn in `concurrency` browsers and written to ffmpeg in order.
 */
export const renderVideo = async ({ timeline, first, last, output, concurrency = defaultConcurrency(), crf = 20 }) => {
  const url = await bundle();
  const audio = audioArgs(timeline, first, last);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const total = last - first + 1;
  const started = Date.now();
  await withBrowsers(concurrency, async (browsers) => {
    const comps = await Promise.all(browsers.map((b) => openComposition(b, url, { comp: "Lecture" })));
    const enc = ffmpeg(
      ["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", ...audio.inputs,
        "-filter_complex", audio.filter, "-map", "0:v", "-map", "[aout]",
        "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-c:v", "libx264", "-crf", String(crf), "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", output],
      ["pipe", "inherit", "inherit"],
    );
    const encoderFailed = enc.exit.then(() => {
      throw new Error("ffmpeg stopped before all frames were written");
    });
    encoderFailed.catch(() => {});

    // Workers claim frames in order; finished frames wait in `ready` until the
    // writer reaches them. A worker pauses when it is too far ahead of the writer.
    const ready = new Map();
    let claimed = first;
    let written = first;
    let pulse;
    let tick;
    const rearm = () => (tick = new Promise((r) => (pulse = r)));
    rearm();
    const wake = () => {
      pulse();
      rearm();
    };
    const waitForProgress = () => Promise.race([tick, encoderFailed]);
    const writer = async () => {
      while (written <= last) {
        if (!ready.has(written)) {
          await waitForProgress();
          continue;
        }
        const buf = ready.get(written);
        ready.delete(written);
        if (!enc.proc.stdin.write(buf)) await Promise.race([once(enc.proc.stdin, "drain"), encoderFailed]);
        written++;
        if ((written - first) % (FPS * 10) === 0) console.log(`frame ${written - first}/${total}`);
        wake();
      }
      enc.proc.stdin.end();
    };
    const worker = async (comp) => {
      while (claimed <= last) {
        if (claimed - written > concurrency * 4) {
          await waitForProgress();
          continue;
        }
        const n = claimed++;
        await comp.show(n);
        ready.set(n, await comp.page.screenshot({ type: "jpeg", quality: 92, optimizeForSpeed: true }));
        wake();
      }
    };
    try {
      await Promise.all([...comps.map(worker), writer()]);
      await enc.exit;
    } finally {
      if (enc.proc.exitCode === null) enc.proc.kill();
    }
  });
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`rendered ${output}: ${total} frames, ${(total / FPS).toFixed(1)} s of video in ${secs} s`);
  console.log(probe(output));
};

/** ffmpeg's stream and duration summary for a media file. */
export const probe = (file) => {
  const r = spawnSync(ffmpegPath, ["-hide_banner", "-i", file], { encoding: "utf8" });
  return r.stderr
    .split("\n")
    .filter((l) => /Duration:|Stream #/.test(l))
    .join("\n");
};

export const defaultConcurrency = () => Math.max(1, Math.min(8, Math.floor(os.availableParallelism() / 2)));

/** Reads --name value from argv. */
export const flag = (args, name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
