"""Make Kokoro's espeak-ng fallback work from a deep directory.

The libespeak-ng bundled with espeakng_loader ignores data paths longer than its
fixed buffer and falls back to the CI path it was built at, failing with
"Error processing file '/Users/runner/work/espeakng-loader/.../phontab'".
phonemizer always hands it an absolute (resolved) path, so a relative path does
not help. Instead: chdir to the espeakng_loader package dir and pass "." straight
to EspeakAPI.

Import this before building a KPipeline. It changes the working directory, so
resolve every relative path first.
"""

import os
import pathlib

import espeakng_loader
import misaki.espeak  # noqa: F401  (configures EspeakWrapper at import time)
from phonemizer.backend.espeak import api

os.chdir(pathlib.Path(espeakng_loader.get_data_path()).parent)
_orig_init = api.EspeakAPI.__init__


def _short_path_init(self, library, data_path):
    _orig_init(self, library, ".")


api.EspeakAPI.__init__ = _short_path_init
