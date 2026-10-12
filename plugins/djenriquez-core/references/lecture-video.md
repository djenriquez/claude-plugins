# Lecture Video Reference

Load this from `/lecture-video` only. The skill owns the workflow and
checkpoints. This file covers the workspace, environment, narration craft,
beat timing, scene design, QA, rendering, and troubleshooting.

Template files live in the skill directory (`skills/lecture-video/template/`),
not under the plugin root.

## Workspace

Everything lives in a session scratch directory, never in the user's repo:

```text
<work>/
  inputs/          downloaded or copied source docs (own directory, untrusted)
  tts-venv/        Python 3.12 venv with Kokoro
  narration.json   the script: scenes → beats
  tts.py, kokoro_setup.py, voice_sample.py
  voice-samples/   optional auditions
  video/           Remotion project (copied from the template)
    public/audio/<scene>.wav     written by tts.py
    src/manifest.json            written by tts.py
    src/lib.tsx                  animation library
    src/scenes.tsx               scene id → component registry
    src/<topic>.tsx              the lecture's scene components
    stills/                      QA PNGs
    out/lecture.mp4              final render
```

`<work>` is the harness scratchpad when one exists, otherwise
`$TMPDIR/lecture-<slug>`. Copy the whole `template/` directory there. Keep
`src/examples.tsx` while designing (it is the pattern catalog), then remove it
from `scenes.tsx` once the real scenes exist. Delete the file before the final
render.

## Environment

Ask before installing. Sizes from a real run: Kokoro plus PyTorch is about
1 GB, `npm install` adds about 250 packages, and Remotion downloads Chrome
Headless Shell (about 170 MB) on the first still or render.

Python (Homebrew may ship 3.14, which PyTorch and Kokoro do not support yet):

```sh
uv venv --python 3.12 <work>/tts-venv
VIRTUAL_ENV=<work>/tts-venv uv pip install kokoro soundfile
<work>/tts-venv/bin/python -I <work>/tts.py <work>/narration.json <work>/video
```

Without `uv`, use `python3.12 -m venv`. The first run downloads the
`hexgrad/Kokoro-82M` weights from Hugging Face and the spaCy
`en_core_web_sm` model. Both are model downloads, not narration uploads; the
text never leaves the machine.

Run Python with `-I` so the interpreter ignores the current directory and
user site packages. The scripts add their own directory to `sys.path`.

Node: `npm install` inside `video/`. The Remotion packages are pinned to one
exact version because mixed Remotion versions fail at runtime. Bump all four
together.

If the harness refuses compound shell commands, split them into one command
per call and write files with the file-writing tool instead of heredocs.

## Voice

- **Never use macOS `say`.** It sounds robotic, and users reject it.
- Default: Kokoro `af_heart` (American English, female). Male option:
  `am_michael`. British: `bf_emma`, `bm_george`. The first letter of the voice
  is its language code; `tts.py` derives it.
- Offer an audition with a real sentence from the narration:
  `voice_sample.py <work>/voice-samples af_heart am_michael --text "..."`.
- Cloud TTS (ElevenLabs, OpenAI) sends the narration text to a third party.
  Offer it only as an option the user must approve, and never for
  confidential source documents without explicit consent.
- `--speed 1.0` is right for most material. Use 0.95 for dense content.

## Narration

`narration.json` holds `{"scenes": [{"id", "beats": [sentence, ...]}]}`.
Scene ids are lowercase (`[a-z][a-z0-9_-]*`) and name the WAV and the
component registry entry. `tts.py` also accepts a `.py` file defining
`SCENES = [(id, [beats])]`.

Voice and register:

- Conversational and engaging, like a good teacher: "Hey there, and
  welcome!", "So let's break some things.", "Here's the punchline."
- One idea per sentence. A beat is one sentence and one visual cue, so a
  sentence carrying two ideas forces two visual changes onto one cue.
- Start each scene with a short framing beat ("Next up, geography.") so the
  scene's layout can appear before details start.
- Close the lecture with a recap scene, then thank the viewer.

Spell for the ear. The narration is never shown on screen, so write what the
voice should say and keep the real spelling in the visuals:

| On screen | In narration |
|-----------|--------------|
| nginx | engine X |
| k8s | Kubernetes |
| API | A P I |
| request ID | request I D |
| PR #1234 | PR twelve thirty-four |
| v1beta2 | v one beta two |
| 1H 2027 | the first half of twenty twenty-seven |
| `retry_backoff_ms` | the retry backoff setting |

Write numbers as words when the digits are ambiguous. Kokoro may mispronounce
acronyms it treats as words. Audition any doubtful term with
`voice_sample.py --text` before synthesizing the whole script.

Pacing: Kokoro runs at about 150 words per minute. Estimate total length as
words ÷ 150 plus about 1.5 s per scene. A good scene is 20–75 s and 4–10
beats. For reference, 23 scenes came to about 16.5 minutes.

Accuracy: every beat and every on-screen label must trace to the source
document. Do not invent numbers, dates, or names to fill a visual. When the
source is ambiguous, say less.

## Beat timing

`tts.py` synthesizes each beat separately and joins them with silence:
0.6 s lead, 0.45 s between beats, 1.1 s tail. It writes
`[{id, duration, beats: [start_seconds]}]` to `video/src/manifest.json`.
`Lecture.tsx` turns that into one `<Sequence>` per scene
(`frames = ceil(duration × 30)`) and hands the scene its beat frames.

Rules:

- Every visual change keys off a beat via `useScene()`. Never hard-code
  seconds or absolute frames. Then a narration edit plus a TTS re-run
  re-times the video with no code change.
- The delay argument (`at(3, 20)`) is in frames after the beat starts. Keep
  delays within the beat's own sentence. Check the manifest: beat `i` lasts
  until `beats[i+1]`.
- **The last beat has the shortest window**: its sentence plus the 1.1 s tail,
  minus a 14-frame fade-out. Size the last beat's animations to finish inside
  it, or add a closing beat. Stills taken just before the fade show whether
  they finished.
- `--only id ...` re-synthesizes some scenes and keeps the others' manifest
  entries. Kokoro produces the same audio length for the same text and
  voice, so unchanged scenes keep their timing.

## Scene design

The goal is a video, not slides. Each scene needs motion that explains the
concept: things move between components, state changes, failures happen,
quantities grow and shrink. Bullets fading in one by one is a slide deck with
a voiceover. If a scene could be a static slide, redesign it.

Pick a pattern by what the beat explains:

| Concept | Motion | Example |
|---------|--------|---------|
| A request path, data flow, layers | `Packet` travelling a polyline; rows light up as it passes; step labels appear on arrival | `Flow` |
| Resilience, blast radius | inject failures one beat at a time: red border, `shake`, packets stop on the dead link, healthy parts keep flowing; caption names the consequence | `Failure` |
| Protocols, handshakes, ordering | sequence diagram: lifelines, arrows drawn with `lin`, replies dashed, final phase in green | `Commit` |
| Lifecycles, statuses | state machine: a token moves along the path, the active node glows, terminal states lock | `States` |
| Plans, phases, history | a timeline that draws itself, one milestone popping per beat | `Roadmap` |
| Fan-out, budgets, amplification | rows of dots multiplying (1 → 3 → 9 → 27), then collapsing to a bounded count | |
| Capacity, packing, suspend/resume | slots on hosts; items fade to dashed when idle, move to storage as packets, pop back elsewhere | |
| Rollouts, canaries | a grid of tiles flipping from v1 to v2 in batches; one fails, the batch rolls back | |
| Ranked choice, routing | candidates get rank badges in order; a packet takes the winning path | |
| Isolation, privilege | concentric rings expanding per beat, labels per ring | |
| Before/after | two columns; the old side dims as the new side slides in | |

Library cheat sheet (`src/lib.tsx`):

- `useScene()` returns `at(i, delay?)` (smooth 0→1 spring), `pop(i, delay?)`
  (overshooting spring for scale-ins), `lin(i, frames, delay?)` (eased
  progress for arrows and packets), `after(i, delay?)` (boolean),
  `beat()` (index of the current beat), `shake(on, i)` (decaying jitter
  in px), `f` (frame), and `B(i)` (beat start frame).
- `SceneFrame kicker title` fades the scene in and out and draws the header.
- `Reveal x y w h p from` positions and springs in any element.
- `Card`, `Pill`, `Caption`, and `Icon` are the visual building blocks.
- `Svg` is a full-canvas layer. `Arrow pts p` draws progressively; `Packet
  pts t` is a glowing dot; `along(pts, t)` gives a point on a path.
- Use palette colours (`C.*`) for arrows; arrowheads exist only for them.

Layout grid (1920×1080 canvas, absolute pixels):

- Header occupies y 70–200. Content lives in x 110–1810, y 240–1000.
- `Caption` occupies about y 930–1010. Keep content above y 920 in scenes
  that caption.
- The progress bar takes the bottom 8 px.
- Elements drawn later paint on top. Draw `Svg` arrows before cards when
  packets should pass behind them, and give such cards an opaque base layer
  (`background: linear-gradient(...), ${C.bg}`).

Group scenes into a few files by part of the lecture (for example
`scenes-a.tsx`) and register every id in `scenes.tsx`. `Lecture.tsx` throws
on an unregistered id.

## QA loop

1. `npx tsc -p .` inside `video/`. Fix every error.
2. `node stills.mjs` renders one half-scale PNG per scene into `stills/`,
   just before the fade-out, where the layout is fully built.
3. View every PNG. Fix what you see.
4. For scenes whose state changes across beats (failures, state machines,
   rollouts), also render intermediate states: `node stills.mjs failure:1
   failure:3` renders 2 s after those beats start.
5. Re-render only changed scenes (`node stills.mjs flow failure`) and view
   them again. Repeat until clean.

Common defects:

- Pills or labels running off the right edge (`Pill` never wraps).
- Labels overlapping borders, arrows, or each other.
- Cramped flex rows with no `gap`.
- Text overflowing a fixed-size card.
- Last-beat animations that never finished (see Beat timing).
- Status text placed under the wrong component.
- Decorations that promise something missing, such as a footnote asterisk
  with no footnote, or a legend entry that never appears.
- A scene that is static after its first beat. Add motion or merge it.

## Render and verify

Run the full render in the background, because a long lecture takes many
minutes:

```sh
npx remotion render src/index.ts Lecture out/lecture.mp4 --concurrency=8 --crf=20
```

Set `--concurrency` to about the number of performance cores. Then verify:

```sh
npx remotion ffprobe -hide_banner out/lecture.mp4
```

Confirm a 1920×1080 h264 video stream, an AAC audio stream, and a duration
equal to the manifest total. Spot-check a few frames with `npx remotion
still` if the render ran after late code edits.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Error processing file '/Users/runner/work/espeakng-loader/.../phontab'` | libespeak-ng ignores long data paths and falls back to its CI build path | Import `kokoro_setup` before building `KPipeline` (the bundled scripts do). It chdirs to the espeak data dir and passes `"."` |
| Relative paths break after Kokoro starts | `kokoro_setup` changes the working directory | Resolve paths before importing it; pass absolute paths |
| Kokoro or torch install fails | venv Python is newer than 3.12 (Homebrew may be 3.14) | Recreate the venv with `uv venv --python 3.12` |
| `No component registered in scenes.tsx for scene "x"` | narration has an id with no component | Add it to `scenes.tsx` |
| Render fails on `audio/<id>.wav` | TTS not run for a new scene | Run `tts.py` (or `--only <id>`) |
| Remotion version mismatch warning | mixed `@remotion/*` versions | Pin all Remotion packages to one version |
| Long pause before the first still | Chrome Headless Shell download | Expected once per machine |

## Anti-pattern: the slide-deck pipeline

A first attempt rendered static HTML slides to PNG, voiced each with macOS
`say`, and concatenated slide videos with ffmpeg. The user rejected it as "a
slide deck talked through" with an "incredibly robotic" voice. Both halves
failed: nothing moved to explain anything, and the voice was unlistenable. Do
not fall back to it when Remotion or Kokoro setup gets hard. Fix the setup or
ask the user.
