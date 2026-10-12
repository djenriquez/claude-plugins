"""Render a short sample per Kokoro voice so the user can pick one.

Usage:
  python -I voice_sample.py OUT_DIR VOICE [VOICE ...] [--text "..."]

Writes OUT_DIR/<voice>.wav. Pass a sentence from the real narration with --text
so the user hears the actual terms.
"""

from __future__ import annotations

import argparse
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
DEFAULT_TEXT = (
    "Hey there, and welcome! Today we're going to walk through how this system works, "
    "one piece at a time. So let's break some things."
)


def main() -> None:
    ap = argparse.ArgumentParser(description="Render Kokoro voice samples.")
    ap.add_argument("out_dir", type=pathlib.Path)
    ap.add_argument("voices", nargs="+")
    ap.add_argument("--text", default=DEFAULT_TEXT)
    args = ap.parse_args()
    out_dir = args.out_dir.resolve()  # kokoro_setup changes the working directory

    sys.path.insert(0, str(HERE))
    import kokoro_setup  # noqa: F401  (must run before KPipeline is built)
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    out_dir.mkdir(parents=True, exist_ok=True)
    pipes: dict[str, KPipeline] = {}
    for voice in args.voices:
        pipe = pipes.setdefault(voice[0], KPipeline(lang_code=voice[0], repo_id="hexgrad/Kokoro-82M"))
        audio = np.concatenate([np.asarray(a, dtype=np.float32) for _, _, a in pipe(args.text, voice=voice, speed=1.0)])
        sf.write(out_dir / f"{voice}.wav", audio, 24000)
        print(out_dir / f"{voice}.wav", f"{len(audio) / 24000:.1f}s")


if __name__ == "__main__":
    main()
