"""Synthesize lecture narration with Kokoro and write beat timings for Remotion.

Usage:
  python -I tts.py NARRATION VIDEO_DIR [--voice af_heart] [--speed 1.0] [--only ID ...]

NARRATION is a .json file ({"scenes": [{"id": ..., "beats": [...]}, ...]}) or a
.py file defining SCENES = [(id, [beat, ...]), ...]. Each beat is one spoken
sentence and one visual cue.

Writes VIDEO_DIR/public/audio/<id>.wav and VIDEO_DIR/src/manifest.json:
[{"id", "duration", "beats": [start_seconds, ...]}, ...]. Scenes animate from
those beat starts, so re-running this re-times the whole video.

--only re-synthesizes the named scenes and keeps every other manifest entry.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import runpy
import sys

HERE = pathlib.Path(__file__).resolve().parent
SR = 24000
LEAD, GAP, TAIL = 0.6, 0.45, 1.1  # seconds of silence: before, between, after beats
ID_RE = re.compile(r"^[a-z][a-z0-9_-]*$")

Scene = tuple[str, list[str]]


def load_narration(path: pathlib.Path) -> list[Scene]:
    if path.suffix == ".py":
        raw = runpy.run_path(str(path))["SCENES"]
        scenes = [(sid, list(beats)) for sid, beats in raw]
    else:
        data = json.loads(path.read_text())
        scenes = [(s["id"], list(s["beats"])) for s in data["scenes"]]
    seen: set[str] = set()
    for sid, beats in scenes:
        if not ID_RE.match(sid):
            raise ValueError(f"scene id {sid!r} must match {ID_RE.pattern}")
        if sid in seen:
            raise ValueError(f"duplicate scene id {sid!r}")
        seen.add(sid)
        if not beats or any(not isinstance(b, str) or not b.strip() for b in beats):
            raise ValueError(f"scene {sid!r} needs one or more non-empty beat strings")
    if not scenes:
        raise ValueError("narration has no scenes")
    return scenes


def timeline(beat_samples: list[int]) -> tuple[list[float], float]:
    """Beat start times and total duration (seconds) for speech of these lengths."""
    lead, gap, tail = int(LEAD * SR), int(GAP * SR), int(TAIL * SR)
    starts = []
    t = lead
    for i, n in enumerate(beat_samples):
        if i:
            t += gap
        starts.append(round(t / SR, 3))
        t += n
    return starts, round((t + tail) / SR, 3)


def merge_manifest(order: list[str], existing: list[dict], fresh: dict[str, dict]) -> list[dict]:
    old = {s["id"]: s for s in existing}
    out = []
    for sid in order:
        entry = fresh.get(sid) or old.get(sid)
        if entry is None:
            raise ValueError(f"scene {sid!r} has no audio yet; synthesize it (drop --only or add it)")
        out.append(entry)
    return out


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

    scenes = load_narration(narration_path)
    order = [sid for sid, _ in scenes]
    unknown = set(args.only or []) - set(order)
    if unknown:
        raise SystemExit(f"--only names unknown scenes: {', '.join(sorted(unknown))}")
    todo = [s for s in scenes if not args.only or s[0] in args.only]
    existing = json.loads(manifest_path.read_text()) if args.only and manifest_path.exists() else []

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
    for sid, beats in todo:
        speech = [
            np.concatenate([np.asarray(a, dtype=np.float32) for _, _, a in pipe(text, voice=args.voice, speed=args.speed)])
            for text in beats
        ]
        starts, duration = timeline([len(s) for s in speech])
        parts = [silence(LEAD)]
        for i, s in enumerate(speech):
            if i:
                parts.append(silence(GAP))
            parts.append(s)
        parts.append(silence(TAIL))
        sf.write(audio_dir / f"{sid}.wav", np.concatenate(parts), SR)
        fresh[sid] = {"id": sid, "duration": duration, "beats": starts}
        print(f"{sid}: {duration:.1f}s, {len(beats)} beats", flush=True)

    manifest = merge_manifest(order, existing, fresh)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    total = sum(s["duration"] for s in manifest)
    print(f"total {total / 60:.1f} min across {len(manifest)} scenes")


if __name__ == "__main__":
    main()
