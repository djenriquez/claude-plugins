"""Synthesize lecture narration with Kokoro and write beat timings for the video.

Usage:
  python -I tts.py NARRATION VIDEO_DIR [--voice af_heart] [--speed 1.0] [--only ID ...]

NARRATION is a .json file ({"scenes": [{"id", "title", "source", "beats": [...]}]})
or a .py file defining SCENES = [(id, [beat, ...]), ...]. A beat is one spoken
sentence and one visual cue: either a string, or {"say", "show", "hold"} where
"say" is spelled for the ear, "show" is the caption text (real spelling), and
"hold" is extra silence in seconds after the sentence so an animation can land.

Writes:
  VIDEO_DIR/public/audio/<id>.wav
  VIDEO_DIR/src/manifest.json   {"voice", "speed", "scenes": [{"id", "title",
                                 "source", "duration", "beats", "ends", "text"}]}
  VIDEO_DIR/out/lecture.vtt     captions, one cue per sentence (long ones split)
  VIDEO_DIR/out/chapters.txt    "m:ss Title" per scene, for a video description or host

Scenes animate from the beat starts, so re-running this re-times the whole video.
--only re-synthesizes the named scenes and keeps every other manifest entry.
"""

from __future__ import annotations

import argparse
import json
import math
import pathlib
import re
import runpy
import sys

HERE = pathlib.Path(__file__).resolve().parent
SR = 24000
FPS = 30  # must match Lecture.tsx; scene start frames = cumulative ceil(duration * FPS)
LEAD, GAP, TAIL = 0.6, 0.45, 1.1  # seconds of silence: before, between, after beats
CUE_CHARS = 84  # two caption lines of about 42 characters
ID_RE = re.compile(r"^[a-z][a-z0-9_-]*$")
SPELLED_RE = re.compile(r"\b[A-Z](?: [A-Z])+\b")  # "A P I" -> "API"
SCENE_KEYS = {"id", "title", "source", "visuals", "beats"}
BEAT_KEYS = {"say", "show", "hold"}

Beat = dict  # {"say": str, "show": str, "hold": float}
Scene = dict  # {"id": str, "title": str | None, "source": str | None, "beats": [Beat]}


def default_show(say: str) -> str:
    """Caption text for a beat with no "show": rejoin letters spelled out for the ear."""
    return SPELLED_RE.sub(lambda m: m.group(0).replace(" ", ""), say)


def load_beat(sid: str, raw: object) -> Beat:
    if isinstance(raw, str):
        raw = {"say": raw}
    if not isinstance(raw, dict):
        raise ValueError(f"scene {sid!r}: a beat must be a string or an object with 'say'")
    extra = set(raw) - BEAT_KEYS
    if extra:
        raise ValueError(f"scene {sid!r}: unknown beat keys {sorted(extra)}; allowed {sorted(BEAT_KEYS)}")
    say, show, hold = raw.get("say"), raw.get("show"), raw.get("hold", 0)
    if not isinstance(say, str) or not say.strip():
        raise ValueError(f"scene {sid!r} needs one or more non-empty beat strings")
    if show is not None and (not isinstance(show, str) or not show.strip()):
        raise ValueError(f"scene {sid!r}: 'show' must be a non-empty string")
    if isinstance(hold, bool) or not isinstance(hold, (int, float)) or hold < 0:
        raise ValueError(f"scene {sid!r}: 'hold' must be a number of seconds >= 0")
    return {"say": say.strip(), "show": (show or default_show(say)).strip(), "hold": float(hold)}


def load_narration(path: pathlib.Path) -> list[Scene]:
    if path.suffix == ".py":
        raw = [{"id": sid, "beats": list(beats)} for sid, beats in runpy.run_path(str(path))["SCENES"]]
    else:
        raw = json.loads(path.read_text())["scenes"]
    scenes: list[Scene] = []
    seen: set[str] = set()
    for s in raw:
        sid = s.get("id")
        if not isinstance(sid, str) or not ID_RE.match(sid):
            raise ValueError(f"scene id {sid!r} must match {ID_RE.pattern}")
        if sid in seen:
            raise ValueError(f"duplicate scene id {sid!r}")
        seen.add(sid)
        extra = set(s) - SCENE_KEYS
        if extra:
            raise ValueError(f"scene {sid!r}: unknown keys {sorted(extra)}; allowed {sorted(SCENE_KEYS)}")
        beats = s.get("beats")
        if not isinstance(beats, list) or not beats:
            raise ValueError(f"scene {sid!r} needs one or more non-empty beat strings")
        scenes.append(
            {"id": sid, "title": s.get("title"), "source": s.get("source"), "beats": [load_beat(sid, b) for b in beats]}
        )
    if not scenes:
        raise ValueError("narration has no scenes")
    return scenes


def timeline(beat_samples: list[int], holds: list[float] | None = None) -> tuple[list[float], list[float], float]:
    """Beat start and speech-end times plus total duration (seconds) for speech of these lengths."""
    holds = holds or [0.0] * len(beat_samples)
    lead, gap, tail = int(LEAD * SR), int(GAP * SR), int(TAIL * SR)
    starts, ends = [], []
    t = lead
    for i, n in enumerate(beat_samples):
        if i:
            t += gap + int(holds[i - 1] * SR)
        starts.append(round(t / SR, 3))
        t += n
        ends.append(round(t / SR, 3))
    return starts, ends, round((t + int(holds[-1] * SR) + tail) / SR, 3)


def merge_manifest(order: list[str], existing: list[dict], fresh: dict[str, dict]) -> list[dict]:
    old = {s["id"]: s for s in existing}
    out = []
    for sid in order:
        entry = fresh.get(sid) or old.get(sid)
        if entry is None:
            raise ValueError(f"scene {sid!r} has no audio yet; synthesize it (drop --only or add it)")
        out.append(entry)
    return out


def scene_offsets(scenes: list[dict]) -> list[float]:
    """Start time (seconds) of each scene in the rendered video, matching Lecture.tsx frame math."""
    offsets, frames = [], 0
    for s in scenes:
        offsets.append(frames / FPS)
        frames += math.ceil(s["duration"] * FPS)
    return offsets


def split_cue(text: str, start: float, end: float, limit: int = CUE_CHARS) -> list[tuple[float, float, str]]:
    """Split a long caption at word boundaries, sharing its time by character count."""
    chunks, cur = [], ""
    for word in text.split():
        if cur and len(cur) + 1 + len(word) > limit:
            chunks.append(cur)
            cur = word
        else:
            cur = f"{cur} {word}" if cur else word
    chunks.append(cur)
    total = sum(len(c) for c in chunks)
    cues, t = [], start
    for i, c in enumerate(chunks):
        nxt = end if i == len(chunks) - 1 else t + (end - start) * len(c) / total
        cues.append((t, nxt, c))
        t = nxt
    return cues


def vtt_time(sec: float) -> str:
    ms = round(sec * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}.{ms % 1000:03d}"


def build_vtt(scenes: list[dict]) -> str:
    lines, n = ["WEBVTT", ""], 0
    for off, s in zip(scene_offsets(scenes), scenes):
        for start, end, text in zip(s["beats"], s["ends"], s["text"]):
            for a, b, chunk in split_cue(text, off + start, off + end):
                n += 1
                lines += [str(n), f"{vtt_time(a)} --> {vtt_time(b)}", chunk, ""]
    return "\n".join(lines)


def clock(sec: float) -> str:
    sec = int(sec)
    return f"{sec // 3600}:{sec // 60 % 60:02d}:{sec % 60:02d}" if sec >= 3600 else f"{sec // 60}:{sec % 60:02d}"


def build_chapters(scenes: list[dict]) -> str:
    """YouTube-style chapter list: one "m:ss Title" line per scene."""
    return "".join(f"{clock(off)} {s.get('title') or s['id']}\n" for off, s in zip(scene_offsets(scenes), scenes))


def read_manifest(path: pathlib.Path) -> dict:
    data = json.loads(path.read_text())
    if not isinstance(data, dict) or "scenes" not in data:
        raise SystemExit(f"{path} uses an older format; re-run without --only")
    return data


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Synthesize lecture narration with Kokoro.")
    ap.add_argument("narration", type=pathlib.Path)
    ap.add_argument("video_dir", type=pathlib.Path)
    ap.add_argument("--voice", default="af_heart", help="Kokoro voice; its first letter is the language code")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--only", nargs="+", metavar="ID", help="re-synthesize only these scenes")
    args = ap.parse_args(argv)

    # kokoro_setup changes the working directory, so resolve paths first.
    narration_path = args.narration.resolve()
    video_dir = args.video_dir.resolve()
    audio_dir = video_dir / "public" / "audio"
    manifest_path = video_dir / "src" / "manifest.json"
    out_dir = video_dir / "out"

    scenes = load_narration(narration_path)
    order = [s["id"] for s in scenes]
    unknown = set(args.only or []) - set(order)
    if unknown:
        raise SystemExit(f"--only names unknown scenes: {', '.join(sorted(unknown))}")
    existing: list[dict] = []
    if args.only and manifest_path.exists():
        old = read_manifest(manifest_path)
        if (old.get("voice"), old.get("speed")) != (args.voice, args.speed):
            raise SystemExit(
                f"manifest was voiced with {old.get('voice')} at speed {old.get('speed')}; "
                "pass the same --voice/--speed or re-run without --only"
            )
        existing = old["scenes"]
    todo = [s for s in scenes if not args.only or s["id"] in args.only]

    sys.path.insert(0, str(HERE))
    import kokoro_setup  # noqa: F401  (must run before KPipeline is built)
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    def silence(sec: float) -> np.ndarray:
        return np.zeros(int(sec * SR), dtype=np.float32)

    audio_dir.mkdir(parents=True, exist_ok=True)
    pipe = KPipeline(lang_code=args.voice[0], repo_id="hexgrad/Kokoro-82M")
    fresh = {}
    for scene in todo:
        sid, beats = scene["id"], scene["beats"]
        speech = [
            np.concatenate([np.asarray(a, dtype=np.float32) for _, _, a in pipe(b["say"], voice=args.voice, speed=args.speed)])
            for b in beats
        ]
        holds = [b["hold"] for b in beats]
        starts, ends, duration = timeline([len(s) for s in speech], holds)
        parts = [silence(LEAD)]
        for i, s in enumerate(speech):
            if i:
                parts.append(silence(GAP + holds[i - 1]))
            parts.append(s)
        parts.append(silence(holds[-1] + TAIL))
        sf.write(audio_dir / f"{sid}.wav", np.concatenate(parts), SR)
        fresh[sid] = {
            "id": sid,
            "title": scene["title"],
            "source": scene["source"],
            "duration": duration,
            "beats": starts,
            "ends": ends,
            "text": [b["show"] for b in beats],
        }
        print(f"{sid}: {duration:.1f}s, {len(beats)} beats", flush=True)

    merged = merge_manifest(order, existing, fresh)
    manifest_path.write_text(json.dumps({"voice": args.voice, "speed": args.speed, "scenes": merged}, indent=2) + "\n")
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "lecture.vtt").write_text(build_vtt(merged))
    (out_dir / "chapters.txt").write_text(build_chapters(merged))
    total = sum(s["duration"] for s in merged)
    print(f"total {total / 60:.1f} min across {len(merged)} scenes; captions and chapters in {out_dir}")


if __name__ == "__main__":
    main()
