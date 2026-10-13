# Lecture Video Reference

Load this from `/lecture-video` only. The skill owns the workflow, defaults,
and opt-in checkpoints. This file covers the workspace, environment, story arc,
narration, beats, scene design, QA, the fact pass, rendering, revisions, and
troubleshooting.

Template files live in the skill directory (`skills/lecture-video/template/`),
not under the plugin root.

## Workspace

Everything is built in a session scratch directory, never in the user's repo:

```text
<work>/
  inputs/          downloaded or copied sources (own directory, untrusted)
  narration.json   the script: scenes → beats, plus title, source, visuals
  tts.py, kokoro_setup.py, voice_sample.py
  voice-samples/   auditions
  video/           Remotion project (copied from the template)
    node_modules   symlink to the cached packages (see Environment)
    public/audio/<scene>.wav     written by tts.py
    src/manifest.json            written by tts.py
    src/lib.tsx                  animation library
    src/scenes.tsx               scene id → component and beat count
    src/<topic>.tsx              the lecture's scene components
    src/Strip.tsx                QA filmstrip composition
    stills/                      QA PNGs and filmstrips
    out/lecture.vtt              captions, written by tts.py
    out/chapters.txt             chapter list, written by tts.py
    out/preview-<ids>.mp4        style previews
    out/lecture.mp4              final render
```

`<work>` is the harness scratchpad when one exists, otherwise
`$TMPDIR/lecture-<slug>`. Both get cleaned up, so the finished files are
copied to the save location (default `~/Movies/<slug>/`). Copy the whole
`template/` directory into `<work>`. Keep `src/examples.tsx` as the pattern catalog; once the real
scenes exist, drop the examples from `scenes.tsx`. The file itself can stay.

## Environment

The tools live in a persistent cache, so setup happens once per machine:
`<cache>` is `${XDG_CACHE_HOME:-$HOME/.cache}/lecture-video`. It holds the
Kokoro venv and the Remotion packages, never lecture inputs or outputs.

```text
<cache>/
  tts-venv/                  Python 3.12 venv with Kokoro
  node/package.json          copy of template/video/package.json
  node/node_modules/         Remotion packages; .remotion/ holds Chrome Headless Shell
```

Reuse the cache when it works:

```sh
<cache>/tts-venv/bin/python -I -c "import kokoro, soundfile"
cmp <template>/video/package.json <cache>/node/package.json
ln -s <cache>/node/node_modules <work>/video/node_modules
```

If the import fails or `<cache>/node` is missing, this is first-time setup.
Ask once, and give the user these facts:

- Kokoro plus PyTorch is about 1 GB. `npm install` adds about 250 packages.
  Remotion downloads Chrome Headless Shell (about 170 MB) on the first still
  or render.
- Remotion is free for individuals, non-profits, and for-profit companies with
  up to 3 employees. Larger companies need a Remotion Company License
  (see remotion.dev/license). Let the user decide whether that applies.
- Renders load Inter and JetBrains Mono from Google Fonts, so they look the
  same on any machine. That is a font download; no source text is sent.

After the answer, create the cache (Homebrew may ship Python 3.14, which
PyTorch and Kokoro do not support yet):

```sh
uv venv --python 3.12 <cache>/tts-venv
uv pip install --python <cache>/tts-venv kokoro soundfile
mkdir -p <cache>/node
cp <template>/video/package.json <cache>/node/package.json
npm install --prefix <cache>/node
```

When only `cmp` fails, the template's pinned Remotion version changed: copy
the new `package.json` and re-run `npm install --prefix <cache>/node`
without asking, since the user already approved these packages. Then link
`node_modules` as above and synthesize with:

```sh
uv run --no-project --python <cache>/tts-venv python -I <work>/tts.py <work>/narration.json <work>/video
```

Without `uv`, use `python3.12 -m venv` and that venv's `bin/python`. The
first synthesis downloads the `hexgrad/Kokoro-82M` weights from Hugging Face
and the spaCy `en_core_web_sm` model (about 12 MB). Both are model downloads,
not narration uploads; the text never leaves the machine.

Run Python with `-I` so the interpreter ignores the current directory and
user site packages. The scripts add their own directory to `sys.path`.

The Remotion packages are pinned to one exact version because mixed Remotion
versions fail at runtime. Bump all of them together.

If the harness refuses compound shell commands, split them into one command
per call and write files with the file-writing tool instead of heredocs.

## Voice

- **Never use macOS `say`.** It sounds robotic, and users reject it.
- Default: Kokoro `af_heart` (American English, female). Male option:
  `am_michael`. British: `bf_emma`, `bm_george`. The first letter of the voice
  is its language code; `tts.py` derives it.
- Auditions are opt-in (`--review`, or when the user asks). Use a real
  sentence from the narration, ideally one with the hardest terms:

  ```sh
  uv run --no-project --python <cache>/tts-venv python -I <work>/voice_sample.py <work>/voice-samples af_heart am_michael --text "..."
  ```
- Cloud TTS (ElevenLabs, OpenAI) sends the narration text to a third party.
  Offer it only as an option the user must approve, and never for
  confidential sources without explicit consent.
- `--speed 1.0` is right for most material. Use 0.95 for dense content.

## Story arc

By default the video is for the people reviewing or relying on the work and
runs about five minutes; arguments or the `--review` outline checkpoint
change that. Cut to fit. A 3–5 minute briefing covers the problem, the
change, and what to check; a full walkthrough adds the mechanics scene by
scene. For reference, 23 scenes came to about
16.5 minutes, which is long for "help me understand this."

For AI-generated work (a PR, an agent-written spec, a design an agent
produced), use this order and drop the parts the source does not support:

1. **The problem**: what was wrong or missing, as a concrete situation, in
   the first ten seconds. A question works well ("Do they get charged
   twice?").
2. **What was built**: the change in one picture.
3. **How it works**: flows, protocols, and states, one scene each.
4. **What can go wrong**: failures and limits.
5. **Decisions**: choices the work made, and the ones it left open. A
   `/audit-decisions` ledger lists these in plain language, least-confident
   first.
6. **What was verified and what wasn't**: tests, checks, and gaps, as the
   source states them.
7. **What to check**: where the viewer's review time is best spent.
8. **Recap and end card**: two or three takeaways, then the source, its
   revision, the generation date, and the synthetic voice.

For teaching a plain document, keep the problem opening, the one-concept
scenes, and the recap; scenes 5–7 become whatever the document leaves open.

## Narration

`narration.json` holds `{"scenes": [{"id", "title", "source", "visuals",
"beats": [...]}]}`. Scene ids are lowercase (`[a-z][a-z0-9_-]*`) and name the
WAV and the registry entry. `title` names the chapter. `source` is the scene's
source location (section, page, or `file:line`) and appears as a small tag on
screen. `visuals` lists every box, arrow, and count the scene draws (see Fact
pass). `tts.py` also accepts a `.py` file defining `SCENES = [(id, [beats])]`.

Voice and register: talk like a colleague walking a teammate through work
they care about. Open each video with the problem, not a greeting, and close
on what to remember. Contractions and warmth are fine. Stock lines are not:
the same opener, transition, or sign-off in every video makes them all sound
alike, so write each one from the material. The humanizer's `narration` mode
checks this.

- One idea per sentence. A beat is one sentence and one visual cue, so a
  sentence carrying two ideas forces two visual changes onto one cue.
- Start each scene with a short framing beat so the scene's layout can appear
  before the details start.
- Say who decided what when the source says it. Keep the source's certainty:
  "the design assumes", "the PR does not test", "the doc doesn't say".

Spell for the ear. Write what the voice should say, and keep the real
spelling in `show` and in the visuals:

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
beats.

Accuracy: every beat traces to the source. Do not invent numbers, dates, or
names to fill a visual. When the source is ambiguous or silent on something
the viewer needs, say so in the narration and show it with
`<Note kind="open">`.

## Beats

A beat is a string or an object:

```json
"Next, the order service validates the cart.",
{"say": "It enters at the A P I gateway.", "show": "It enters at the API gateway.", "hold": 1.5}
```

- `say` is what Kokoro speaks.
- `show` is the caption text in real spelling. When omitted, it is `say` with
  spelled-out capitals rejoined ("A P I" → "API", "request I D" →
  "request ID"). Set it for anything else spelled for the ear.
- `hold` is extra silence in seconds after the sentence, so an animation can
  play out (a packet travelling, a diff growing) without adding words.
  Use it on the last beat instead of padding the narration.

## Beat timing

`tts.py` synthesizes each beat separately and joins them with silence:
0.6 s lead, 0.45 s plus `hold` between beats, `hold` plus 1.1 s tail. It
writes `{voice, speed, scenes: [{id, title, source, duration, beats, ends,
text}]}` to `video/src/manifest.json`, where `beats` are sentence start times
and `ends` speech end times. `Lecture.tsx` turns that into one `<Sequence>`
per scene (`frames = ceil(duration × 30)`) and hands the scene its beat
frames. From the same manifest, `tts.py` writes `out/lecture.vtt` and
`out/chapters.txt`.

Rules:

- Every visual change keys off a beat via `useScene()`. Never hard-code
  seconds or absolute frames. Then a narration edit plus a TTS re-run
  re-times the video with no code change.
- `scenes.tsx` records each scene's beat count, and `Lecture.tsx` refuses to
  render when the narration's count differs. Merging or splitting a sentence
  shifts every later `at(i)` onto a different sentence, so re-key the
  component, then update the count.
- The delay argument (`at(3, 20)`) is in frames after the beat starts. Keep
  delays within the beat's own sentence. Check the manifest: beat `i` lasts
  until `beats[i+1]`.
- **The last beat has the shortest window**: its sentence plus `hold` and the
  1.1 s tail, minus a 14-frame fade-out. Give it a `hold` or size its
  animations to finish inside it. The filmstrip's last frame shows whether
  they did.
- `--only id ...` re-synthesizes some scenes and keeps the others' manifest
  entries. Kokoro produces the same audio length for the same text and
  voice, so unchanged scenes keep their timing. It refuses to mix voices or
  speeds; re-run everything to change them.

## Scene design

The goal is a video, not slides. Each scene needs motion that explains the
concept: things move between components, state changes, failures happen,
quantities grow and shrink. Bullets fading in one by one is a slide deck with
a voiceover. If a scene could be a static slide, redesign it.

Motion also has to earn its place. Keep one focal motion per beat, on the
thing the sentence is about; dim the rest with `focus` or move the camera to
it. Ambient motion (looping packets, pulsing glows) stays subtle and
secondary. Several things moving at once make the viewer choose where to
look, and they often choose wrong.

Vary the staging across a long video: alternate full-canvas diagrams, camera
moves into a detail, code panels, and scenes without a header (like the
intro and outro examples). Twenty scenes with the same header and the same
fade feel like a deck.

Pick a pattern by what the beat explains:

| Concept | Motion | Example |
|---------|--------|---------|
| The problem, the hook | a concrete situation, then the question it raises | `Intro` |
| A request path, data flow, layers | `Packet` travelling a polyline; the described row stays lit while the others dim; step labels appear on arrival | `Flow` |
| A code change, a PR | `Code` diff that grows line by line; highlights follow the sentences; a small side panel shows the effect | `Change` |
| Resilience, blast radius | inject failures one beat at a time: the camera moves to the broken part, the rest dims, healthy links keep flowing; caption names the consequence | `Failure` |
| Protocols, handshakes, ordering | sequence diagram: lifelines, arrows drawn with `lin`, replies dashed, final phase in green | `Commit` |
| Lifecycles, statuses | state machine: a token moves along the path, the active node glows, terminal states lock | `States` |
| Plans, phases, history | a timeline that draws itself, one milestone popping per beat | `Roadmap` |
| Decisions, verification, open questions | `Note` rows, one per beat; at the end, only the items that need review stay lit | `Review` |
| Recap and provenance | takeaways, then `EndCard` | `Outro` |
| Fan-out, budgets, amplification | rows of dots multiplying (1 → 3 → 9 → 27), then collapsing to a bounded count | |
| Capacity, packing, suspend/resume | slots on hosts; items fade to dashed when idle, move to storage as packets, pop back elsewhere | |
| Rollouts, canaries | a grid of tiles flipping from v1 to v2 in batches; one fails, the batch rolls back | |
| Ranked choice, routing | candidates get rank badges in order; a packet takes the winning path | |
| Isolation, privilege | concentric rings expanding per beat, labels per ring | |
| Before/after | two columns; the old side dims as the new side slides in | |

Library cheat sheet (`src/lib.tsx`):

- `useScene()` returns `at(i, delay?)` (smooth 0→1 spring), `pop(i, delay?)`
  (overshooting spring for scale-ins), `lin(i, frames, delay?)` (eased
  progress for arrows, packets, and camera moves), `after(i, delay?)`
  (boolean), `beat()` (index of the current beat), `shake(on, i)` (decaying
  jitter in px), `focus(isOn, dim?)` (opacity that eases between lit and
  dimmed at each beat; `isOn(b)` says whether the element is in focus during
  beat `b`), `f` (frame), and `B(i)` (beat start frame).
- `SceneFrame kicker title` fades the scene in and out, draws the header, and
  shows the scene's `source` tag.
- `Camera shots` eases the view to a point and zoom at each shot's beat. Wrap
  the content only, not the header or caption. A canvas point lands on
  screen at `960 + zoom × (px − x)`, `540 + zoom × (py − y)`; keep zoomed
  content between y 240 and 920.
- `Reveal x y w h p from` positions and springs in any element.
- `Card`, `Pill`, `Caption`, and `Icon` are the visual building blocks.
- `Code lines file hl` shows code or a diff (`kind: "add" | "del"`); each
  line appears at its `beat`, and `hl` steps move the highlight per beat.
  Lines never wrap.
- `Note kind` marks a `decision`, `verified`, `unverified`, or `open` item;
  its text wraps.
- `EndCard source revision made` closes the video with provenance and the
  synthetic-voice note.
- `Svg` is a full-canvas layer. `Arrow pts p` draws progressively; `Packet
  pts t` is a glowing dot; `along(pts, t)` gives a point on a path.
- Use palette colours (`C.*`) for arrows; arrowheads exist only for them.
- Text uses `FONT` (Inter) and `MONO` (JetBrains Mono) at weights 400–900 in
  steps of 100. Draw checkmarks and crosses with `Icon`, not text glyphs.

Layout grid (1920×1080 canvas, absolute pixels):

- Header occupies y 70–200. Content lives in x 110–1810, y 240–1000.
- `Caption` occupies about y 930–1010. Keep content above y 920 in scenes
  that caption.
- The source tag sits bottom-left at about y 1030–1060, and the progress bar
  takes the bottom 8 px.
- Elements drawn later paint on top. Draw `Svg` arrows before cards when
  packets should pass behind them; cards already have an opaque base.

Group scenes into a few files by part of the lecture (for example
`scenes-a.tsx`) and register every id with its beat count in `scenes.tsx`.

## QA loop

1. `npx tsc -p .` inside `video/`. Fix every error.
2. `node stills.mjs` renders one half-scale PNG per scene into `stills/`,
   just before the fade-out, where the layout is fully built.
3. `node stills.mjs --strip` renders a filmstrip per scene: each beat's
   caption text beside three frames from that sentence (just after it
   starts, mid-sentence, and just before the next one). Use it to check that
   each animation happens during its own sentence and that the last beat's
   animations finish.
4. View every PNG. Fix what you see.
5. For a closer look at one moment, `node stills.mjs failure:1 failure:3`
   renders full frames 2 s after those beats start.
6. Re-render only changed scenes (`node stills.mjs flow failure`,
   `node stills.mjs --strip flow`) and view them again. Repeat until clean.

For the `--review` style preview, `node preview.mjs intro flow` renders
those scenes (and any between them) with audio to
`out/preview-intro-flow.mp4`.

Common defects:

- Pills or labels running off the right edge (`Pill` never wraps).
- Labels overlapping borders, arrows, or each other.
- Camera moves pushing content under the header or caption.
- Cramped flex rows with no `gap`.
- Text overflowing a fixed-size card.
- Motion landing a sentence early or late, or last-beat animations that
  never finished (filmstrip).
- Status text placed under the wrong component.
- Decorations that promise something missing, such as a footnote asterisk
  with no footnote, or a legend entry that never appears.
- A scene that is static after its first beat. Add motion or merge it.

## Fact pass

Pictures make claims too. A drawn arrow says two things talk; three retry
markers say there are three retries. Before designing a scene, record in its
`visuals` what it will draw, each item taken from the source:

```json
"visuals": {
  "boxes": ["Client", "API gateway", "Order service", "Database"],
  "arrows": ["Client -> API gateway -> Order service -> Database: request"],
  "illustrative": ["packet dots show traffic, not a rate"]
}
```

Then check the stills against it, arrow by arrow: each arrow's source,
destination, direction, and label; every box and its label; every number.
Look for extra arrows and implied hops that are not in the inventory. Counts
that only illustrate go under `illustrative`. Remove them, or draw them so
they read as illustrative (one marker instead of three). Then check each
beat's words against the source, including its certainty.

## Render and verify

Run the full render in the background:

```sh
npx remotion render src/index.ts Lecture out/lecture.mp4 --concurrency=8 --crf=20
```

Set `--concurrency` to about the number of performance cores. On a 10-core
Apple-silicon Mac, the 3.7-minute example renders in about 70 s and comes
to about 28 MB, so a 16-minute lecture takes about 5 minutes. Blur filters
and `backdrop-filter` are slow without a GPU, which headless Chromium
disables by default: an earlier background built on them doubled the
example's render time. The library avoids them, so keep it that way in new
scenes. Then verify:

```sh
npx remotion ffprobe -hide_banner out/lecture.mp4
```

Confirm a 1920×1080 h264 video stream, an AAC audio stream, and a duration
equal to the manifest total. Spot-check a few frames with `npx remotion
still` if the render ran after late code edits.

Deliver `lecture.vtt` and `chapters.txt` with the MP4. Most players and video
hosts accept a WebVTT sidecar, and `chapters.txt` pastes into a video
description. Remotion's bundled ffmpeg cannot read either file, so embedding
them in the MP4 needs a separate ffmpeg; leave that to the user.

## Revisions

Feedback after delivery usually touches a few scenes:

1. Edit those scenes' beats in `narration.json`, then run `tts.py --only
   <ids>` (captions and chapters update with it).
2. If a beat count changed, re-key the component and update `scenes.tsx`.
3. Redo QA for those scenes (stills and filmstrips), then the fact pass for
   any changed claims.
4. Re-render the full MP4 and copy the new files to the save location.

If `<work>` is gone, copy `template/` into a new `<work>`, link the cached
`node_modules`, and restore `narration.json` and the `src/*.tsx` scene files
from the save location, where delivery always puts them.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot find module 'remotion'` | `video/node_modules` link is missing | `ln -s <cache>/node/node_modules <work>/video/node_modules` |
| `Error processing file '/Users/runner/work/espeakng-loader/.../phontab'` | libespeak-ng ignores long data paths and falls back to its CI build path | Import `kokoro_setup` before building `KPipeline` (the bundled scripts do). It chdirs to the espeak data dir and passes `"."` |
| Relative paths break after Kokoro starts | `kokoro_setup` changes the working directory | Resolve paths before importing it; pass absolute paths |
| Kokoro or torch install fails | venv Python is newer than 3.12 (Homebrew may be 3.14) | Recreate the venv with `uv venv --python 3.12` |
| `No component registered in scenes.tsx for scene "x"` | narration has an id with no component | Add it to `scenes.tsx` |
| `Scene "x" is animated for N beats but its narration has M` | sentences were merged or split | Re-key the component's beat indexes, then update the count |
| `manifest ... uses an older format` or `was voiced with ...` | `--only` against an old manifest or a different voice or speed | Re-run `tts.py` without `--only` |
| Render fails on `audio/<id>.wav` | TTS not run for a new scene | Run `tts.py` (or `--only <id>`) |
| `Timed out loading Google Font` | no network during render | Restore network access; the fonts download once per render |
| Remotion version mismatch warning | mixed `@remotion/*` versions | Pin all Remotion packages to one version |
| Long pause before the first still | Chrome Headless Shell download | Expected once per machine |

## Anti-pattern: the slide-deck pipeline

A first attempt rendered static HTML slides to PNG, voiced each with macOS
`say`, and concatenated slide videos with ffmpeg. The user rejected it as "a
slide deck talked through" with an "incredibly robotic" voice. Both halves
failed: nothing moved to explain anything, and the voice was unlistenable. Do
not fall back to it when Remotion or Kokoro setup gets hard. Fix the setup or
ask the user.
