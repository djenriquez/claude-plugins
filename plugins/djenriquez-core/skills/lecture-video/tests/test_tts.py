"""Narration loading and beat timing; these tests never load Kokoro."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parents[1] / "template"
SPEC = importlib.util.spec_from_file_location("tts", TEMPLATE / "tts.py")
tts = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tts)


class LoadNarrationTest(unittest.TestCase):
    def write(self, name: str, text: str) -> Path:
        d = Path(tempfile.mkdtemp())
        p = d / name
        p.write_text(text)
        return p

    def test_bundled_example_loads(self):
        scenes = tts.load_narration(TEMPLATE / "narration.json")
        self.assertEqual([s for s, _ in scenes], ["intro", "flow", "failure", "commit", "states", "roadmap"])

    def test_bundled_manifest_matches_example_narration(self):
        scenes = tts.load_narration(TEMPLATE / "narration.json")
        manifest = json.loads((TEMPLATE / "video" / "src" / "manifest.json").read_text())
        self.assertEqual([s["id"] for s in manifest], [s for s, _ in scenes])
        for (_, beats), entry in zip(scenes, manifest):
            self.assertEqual(len(entry["beats"]), len(beats))

    def test_python_scenes(self):
        p = self.write("n.py", 'SCENES = [("intro", ["Hello there."]), ("next", ["One.", "Two."])]\n')
        self.assertEqual(tts.load_narration(p), [("intro", ["Hello there."]), ("next", ["One.", "Two."])])

    def test_rejects_bad_ids_duplicates_and_empty_beats(self):
        cases = {
            "id": {"scenes": [{"id": "Bad Id", "beats": ["x"]}]},
            "duplicate": {"scenes": [{"id": "a", "beats": ["x"]}, {"id": "a", "beats": ["y"]}]},
            "empty": {"scenes": [{"id": "a", "beats": ["  "]}]},
            "none": {"scenes": []},
        }
        for label, data in cases.items():
            with self.subTest(label):
                with self.assertRaises(ValueError):
                    tts.load_narration(self.write("n.json", json.dumps(data)))


class TimelineTest(unittest.TestCase):
    def test_starts_include_lead_and_gaps(self):
        sr = tts.SR
        starts, total = tts.timeline([2 * sr, 3 * sr])
        self.assertEqual(starts, [tts.LEAD, round(tts.LEAD + 2 + tts.GAP, 3)])
        self.assertAlmostEqual(total, tts.LEAD + 2 + tts.GAP + 3 + tts.TAIL, places=3)


class MergeManifestTest(unittest.TestCase):
    def test_only_replaces_named_scenes_in_narration_order(self):
        old = [{"id": "a", "duration": 1, "beats": [0.6]}, {"id": "b", "duration": 2, "beats": [0.6]}]
        fresh = {"b": {"id": "b", "duration": 9, "beats": [0.6]}}
        merged = tts.merge_manifest(["b", "a"], old, fresh)
        self.assertEqual([(s["id"], s["duration"]) for s in merged], [("b", 9), ("a", 1)])

    def test_missing_scene_is_an_error(self):
        with self.assertRaises(ValueError):
            tts.merge_manifest(["a", "new"], [{"id": "a", "duration": 1, "beats": [0.6]}], {})


if __name__ == "__main__":
    unittest.main()
