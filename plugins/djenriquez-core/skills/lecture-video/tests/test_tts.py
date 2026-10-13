"""Narration loading, beat timing, captions, and chapters; these tests never load Kokoro."""

import importlib.util
import json
import re
import tempfile
import unittest
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parents[1] / "template"
SPEC = importlib.util.spec_from_file_location("tts", TEMPLATE / "tts.py")
tts = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tts)

EXAMPLE_IDS = ["intro", "flow", "change", "failure", "commit", "states", "roadmap", "review", "outro"]


def write(name: str, text: str) -> Path:
    p = Path(tempfile.mkdtemp()) / name
    p.write_text(text)
    return p


def narration(*scenes: dict) -> Path:
    return write("n.json", json.dumps({"scenes": list(scenes)}))


class BundledExampleTest(unittest.TestCase):
    def test_example_loads(self):
        scenes = tts.load_narration(TEMPLATE / "narration.json")
        self.assertEqual([s["id"] for s in scenes], EXAMPLE_IDS)
        self.assertTrue(all(s["title"] and s["source"] for s in scenes))

    def test_manifest_matches_example_narration(self):
        scenes = tts.load_narration(TEMPLATE / "narration.json")
        manifest = json.loads((TEMPLATE / "video" / "src" / "manifest.json").read_text())
        self.assertEqual(manifest["voice"], "af_heart")
        self.assertEqual([s["id"] for s in manifest["scenes"]], EXAMPLE_IDS)
        for scene, entry in zip(scenes, manifest["scenes"]):
            self.assertEqual(entry["text"], [b["show"] for b in scene["beats"]])
            self.assertEqual(len(entry["beats"]), len(entry["ends"]))
            self.assertEqual((entry["title"], entry["source"]), (scene["title"], scene["source"]))

    def test_scene_registry_beat_counts_match_example_narration(self):
        registry = (TEMPLATE / "video" / "src" / "scenes.tsx").read_text()
        counts = {sid: int(n) for sid, n in re.findall(r"(\w+): \{ component: \w+, beats: (\d+) \}", registry)}
        scenes = tts.load_narration(TEMPLATE / "narration.json")
        self.assertEqual(counts, {s["id"]: len(s["beats"]) for s in scenes})


class LoadNarrationTest(unittest.TestCase):
    def test_python_scenes(self):
        p = write("n.py", 'SCENES = [("intro", ["Hello there."]), ("next", ["One.", "Two."])]\n')
        scenes = tts.load_narration(p)
        self.assertEqual([(s["id"], [b["say"] for b in s["beats"]]) for s in scenes], [("intro", ["Hello there."]), ("next", ["One.", "Two."])])

    def test_beat_objects(self):
        scenes = tts.load_narration(
            narration(
                {
                    "id": "a",
                    "title": "A",
                    "source": "§1",
                    "visuals": {"boxes": ["x"]},
                    "beats": [
                        "The A P I gateway checks the request I D.",
                        {"say": "In Q one, it ships.", "show": "In Q1, it ships.", "hold": 1.5},
                    ],
                }
            )
        )
        b0, b1 = scenes[0]["beats"]
        self.assertEqual(b0, {"say": "The A P I gateway checks the request I D.", "show": "The API gateway checks the request ID.", "hold": 0.0})
        self.assertEqual(b1, {"say": "In Q one, it ships.", "show": "In Q1, it ships.", "hold": 1.5})
        self.assertEqual((scenes[0]["title"], scenes[0]["source"]), ("A", "§1"))

    def test_default_show_leaves_single_capitals_alone(self):
        self.assertEqual(tts.default_show("I think A is fine."), "I think A is fine.")

    def test_rejects_invalid_narration(self):
        cases = {
            "id": {"id": "Bad Id", "beats": ["x"]},
            "empty beat": {"id": "a", "beats": ["  "]},
            "no beats": {"id": "a", "beats": []},
            "unknown beat key": {"id": "a", "beats": [{"say": "x", "pause": 1}]},
            "negative hold": {"id": "a", "beats": [{"say": "x", "hold": -1}]},
            "empty show": {"id": "a", "beats": [{"say": "x", "show": ""}]},
            "unknown scene key": {"id": "a", "beats": ["x"], "notes": "?"},
        }
        for label, scene in cases.items():
            with self.subTest(label):
                with self.assertRaises(ValueError):
                    tts.load_narration(narration(scene))
        with self.assertRaises(ValueError):
            tts.load_narration(narration({"id": "a", "beats": ["x"]}, {"id": "a", "beats": ["y"]}))
        with self.assertRaises(ValueError):
            tts.load_narration(narration())


class TimelineTest(unittest.TestCase):
    def test_starts_include_lead_and_gaps(self):
        sr = tts.SR
        starts, ends, total = tts.timeline([2 * sr, 3 * sr])
        self.assertEqual(starts, [tts.LEAD, round(tts.LEAD + 2 + tts.GAP, 3)])
        self.assertEqual(ends, [tts.LEAD + 2, round(tts.LEAD + 2 + tts.GAP + 3, 3)])
        self.assertAlmostEqual(total, tts.LEAD + 2 + tts.GAP + 3 + tts.TAIL, places=3)

    def test_hold_delays_the_next_beat_and_extends_the_last(self):
        sr = tts.SR
        starts, _, total = tts.timeline([2 * sr, 3 * sr], [1.0, 0.5])
        self.assertEqual(starts[1], round(tts.LEAD + 2 + 1.0 + tts.GAP, 3))
        self.assertAlmostEqual(total, tts.LEAD + 2 + 1.0 + tts.GAP + 3 + 0.5 + tts.TAIL, places=3)


class MergeManifestTest(unittest.TestCase):
    def test_only_replaces_named_scenes_in_narration_order(self):
        old = [{"id": "a", "duration": 1, "beats": [0.6]}, {"id": "b", "duration": 2, "beats": [0.6]}]
        fresh = {"b": {"id": "b", "duration": 9, "beats": [0.6]}}
        merged = tts.merge_manifest(["b", "a"], old, fresh)
        self.assertEqual([(s["id"], s["duration"]) for s in merged], [("b", 9), ("a", 1)])

    def test_missing_scene_is_an_error(self):
        with self.assertRaises(ValueError):
            tts.merge_manifest(["a", "new"], [{"id": "a", "duration": 1, "beats": [0.6]}], {})

    def test_old_manifest_format_is_rejected(self):
        with self.assertRaises(SystemExit):
            tts.read_manifest(write("m.json", "[]"))


SCENES = [
    {"id": "a", "title": "Start here", "duration": 10.01, "beats": [0.6, 4.0], "ends": [3.5, 9.0], "text": ["One.", "Two."]},
    {"id": "b", "title": None, "duration": 5.0, "beats": [0.6], "ends": [4.0], "text": ["Three."]},
]


class CaptionsTest(unittest.TestCase):
    def test_vtt_offsets_scenes_by_whole_frames(self):
        vtt = tts.build_vtt(SCENES)
        self.assertTrue(vtt.startswith("WEBVTT\n\n1\n00:00:00.600 --> 00:00:03.500\nOne.\n"))
        # scene a lasts ceil(10.01 * 30) = 301 frames, so scene b starts at 301 / 30 s
        self.assertIn("3\n00:00:10.633 --> 00:00:14.033\nThree.\n", vtt)

    def test_long_cue_splits_at_words_and_keeps_its_time_span(self):
        text = " ".join(["word"] * 40)
        cues = tts.split_cue(text, 1.0, 9.0, limit=50)
        self.assertGreater(len(cues), 1)
        self.assertTrue(all(len(c) <= 50 for _, _, c in cues))
        self.assertEqual(" ".join(c for _, _, c in cues), text)
        self.assertEqual((cues[0][0], cues[-1][1]), (1.0, 9.0))
        self.assertTrue(all(a[1] == b[0] for a, b in zip(cues, cues[1:])))

    def test_time_formats(self):
        self.assertEqual(tts.vtt_time(3725.5), "01:02:05.500")
        self.assertEqual((tts.clock(65), tts.clock(3725)), ("1:05", "1:02:05"))


class ChaptersTest(unittest.TestCase):
    def test_chapter_list_uses_titles_and_scene_offsets(self):
        self.assertEqual(tts.build_chapters(SCENES), "0:00 Start here\n0:10 b\n")


if __name__ == "__main__":
    unittest.main()
