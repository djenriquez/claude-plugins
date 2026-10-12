---
name: lecture-video
description: >
  Turns a source document (PDF, markdown spec, design doc) into an animated,
  narrated lecture video: motion graphics synced sentence by sentence to a
  natural local voice, rendered to MP4 with Remotion and Kokoro TTS. Use when
  the user asks to make a video, lecture, explainer, or narrated walkthrough
  video from a doc, or wants an animated video explaining a spec or design.
  Not for static slide decks or single diagrams (use a slides or diagram
  skill, or /pr-figure for pull requests).
argument-hint: "[path or URL to the source document]"
disable-model-invocation: false
allowed-tools:
  - Bash(uv:*)
  - Bash(python3:*)
  - Bash(npm:*)
  - Bash(npx:*)
  - Bash(node:*)
  - Bash(cp:*)
  - Bash(mkdir:*)
  - Bash(ls:*)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
---

# Lecture Video

Turn one source document into a narrated video where motion explains the
ideas: packets move between components, failures happen, states change, all
timed to the spoken sentence. It is a video, not a slide deck read aloud.

Load `references/lecture-video.md` (plugin root) before starting. It holds
the narration craft, beat timing, scene patterns, QA checklist, render
commands, and troubleshooting. The project template is skill-local: resolve
`template/` from the directory that contains this `SKILL.md`.

`$ARGUMENTS` is the source document. If it is missing, ask for it.

## Invariants

- **local-voice**: narrate with Kokoro on the user's machine (default voice
  `af_heart`). Never use macOS `say`. Cloud TTS sends the script to a third
  party, so offer it only as an option the user must approve.
- **ask-first**: get the user's approval before installs (about 1 GB of
  PyTorch, the npm packages, and the Chrome Headless Shell download), before
  choosing the voice, and before anything leaves the machine.
- **scratch-only**: build everything in a session scratch directory. Put
  downloaded inputs in their own directory. Never write into the user's repo
  unless they ask for the MP4 there.
- **beat-synced**: one beat is one spoken sentence and one visual cue. Every
  animation keys off a beat start from `manifest.json`, never hard-coded
  seconds.
- **video-not-slides**: every scene has motion that explains its concept. If
  a scene could be a static slide, redesign it.
- **grounded**: every spoken claim and on-screen label traces to the source.
  No invented numbers, dates, or names.
- **see-before-render**: view every QA still before the full render.
- **honest-report**: report what was verified and what was not.

## Process

1. **Read the source** fully (PDF pages in chunks). Inventory the concepts,
   flows, failure cases, lifecycles, and plans that could become scenes.
2. **Outline** scenes: one concept per scene, 20–75 s each, a recap scene to
   close. Estimate length at about 150 words per minute.
3. **Checkpoint (one combined question)**: show the outline and estimated
   length, propose the voice (offer `af_heart` and `am_michael` samples), and
   ask approval for the installs. Do not install anything before the answer.
4. **Set up** `<work>`: copy `template/` there, then create the Python 3.12
   venv with Kokoro and run `npm install` in `video/` (reference,
   Environment).
5. **Write `narration.json`**: conversational, one idea per sentence,
   spelled for the ear ("engine X" for nginx, "A P I"), with real spelling
   kept for on-screen text (reference, Narration). Show the script and get
   the user's approval before synthesizing; wording fixes are cheap now and
   cost a re-synthesis and re-timing later.
6. **Synthesize**: `tts-venv/bin/python -I tts.py narration.json video`.
   Check the per-scene durations and the total against the outline.
7. **Design scenes**: one component per scene id, registered in
   `video/src/scenes.tsx`. Start from the patterns in `src/examples.tsx` and
   the reference's pattern table. Fit each scene's last-beat animation inside
   its window.
8. **QA**: `npx tsc -p .`, then `node stills.mjs`, then view every PNG. Fix
   overflow, overlap, and unfinished animations. Render intermediate states
   (`node stills.mjs id:beat`) for scenes that change across beats. Re-render
   only changed scenes until clean.
9. **Fact pass**: compare each beat and visible label against the source.
   Fix drift, then re-run `tts.py --only <ids>` for edited scenes and redo
   their stills.
10. **Render** in the background:
    `npx remotion render src/index.ts Lecture out/lecture.mp4 --concurrency=8 --crf=20`.
    Verify the streams and duration with `npx remotion ffprobe`.
11. **Report** using `references/reporting-style.md`.

## Output

```text
Video: <absolute path to out/lecture.mp4>
Length: <m:ss> across <n> scenes · voice <voice>
Verified: <type-check, stills viewed, fact pass, ffprobe streams/duration>
Not verified: <for example full playback, pronunciation of specific terms>
```

## Harness notes

- Claude Code: view PDFs and PNG stills with `Read`. Run the full render with
  `Bash` `run_in_background`, then wait for its completion notice. The
  session scratchpad directory is `<work>`.
- Codex: view stills with the image viewer tool. Run the render as a
  long-running command and poll its log. Use `$TMPDIR/lecture-<slug>` as
  `<work>` when no scratchpad is provided.
- If the harness refuses compound shell commands, run one command per call
  and write files with the file-writing tool instead of heredocs.
