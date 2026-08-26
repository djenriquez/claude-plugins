#!/usr/bin/env python3
from __future__ import annotations

import http.client
import json
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

import server  # noqa: E402


WEB = Path(__file__).resolve().parents[2] / "web"

MIN_GRAPH = {
    "title": "Upload path",
    "pr": {
        "url": "https://github.com/djenriquez/claude-plugins/pull/1",
        "number": 1,
        "title": "Add upload",
    },
    "bands": [
        {"id": "control", "label": "Control plane"},
        {"id": "data", "label": "Data plane"},
    ],
    "nodes": [
        {
            "id": "skill",
            "label": "PR figure",
            "band": "control",
            "role": "Authors the drawing spec from the PR diff.",
            "evidence": [{"path": "skills/pr-figure/SKILL.md", "start_line": 1, "end_line": 20}],
        },
        {
            "id": "upload",
            "label": "Upload script",
            "band": "data",
            "role": "Hosts the PNG as a GitHub user-attachment.",
            "evidence": [{"path": "skills/pr-figure/scripts/upload_github_asset.py"}],
        },
    ],
    "edges": [
        {
            "id": "e1",
            "from": "skill",
            "to": "upload",
            "kind": "control",
            "label": "publish",
        }
    ],
    "do_not_draw": ["GitHub Pages"],
    "annotations": ["One figure per PR"],
    "summary": {
        "problem": "Reviewers reconstruct architecture from prose.",
        "change": "The skill hosts the PNG as a GitHub attachment.",
    },
}


class ValidateGraphTests(unittest.TestCase):
    def test_accepts_min_graph(self) -> None:
        out = server.validate_graph(MIN_GRAPH)
        self.assertEqual(out["title"], "Upload path")
        self.assertEqual(len(out["nodes"]), 2)
        self.assertEqual(out["summary"]["problem"], MIN_GRAPH["summary"]["problem"])

    def test_rejects_missing_summary(self) -> None:
        bad = json.loads(json.dumps(MIN_GRAPH))
        del bad["summary"]
        with self.assertRaises(server.GraphError):
            server.validate_graph(bad)

    def test_rejects_overlong_summary(self) -> None:
        bad = json.loads(json.dumps(MIN_GRAPH))
        bad["summary"]["problem"] = "x" * 801
        with self.assertRaises(server.GraphError):
            server.validate_graph(bad)

    def test_rejects_unknown_edge_kind(self) -> None:
        bad = json.loads(json.dumps(MIN_GRAPH))
        bad["edges"][0]["kind"] = "magic"
        with self.assertRaises(server.GraphError):
            server.validate_graph(bad)

    def test_rejects_missing_node_ref(self) -> None:
        bad = json.loads(json.dumps(MIN_GRAPH))
        bad["edges"][0]["to"] = "nope"
        with self.assertRaises(server.GraphError):
            server.validate_graph(bad)

    def test_rejects_unknown_band(self) -> None:
        bad = json.loads(json.dumps(MIN_GRAPH))
        bad["nodes"][0]["band"] = "other"
        with self.assertRaises(server.GraphError):
            server.validate_graph(bad)

    def test_accepts_column_and_bullets(self) -> None:
        graph = json.loads(json.dumps(MIN_GRAPH))
        graph["nodes"][0]["column"] = 1
        graph["nodes"][0]["bullets"] = ["hosts the PNG"]
        out = server.validate_graph(graph)
        self.assertEqual(out["nodes"][0]["column"], 1)
        self.assertEqual(out["nodes"][0]["bullets"], ["hosts the PNG"])
        self.assertEqual(out["layout"], "landscape")

    def test_accepts_sections(self) -> None:
        graph = json.loads(json.dumps(MIN_GRAPH))
        graph["nodes"][1]["sections"] = [
            {"title": "Legacy scalars", "kind": "data-happy", "bullets": ["image", "command (flattened)", "env"]}
        ]
        out = server.validate_graph(graph)
        self.assertEqual(out["nodes"][1]["sections"][0]["title"], "Legacy scalars")
        self.assertEqual(len(out["nodes"][1]["sections"][0]["bullets"]), 3)

    def test_rejects_unknown_layout(self) -> None:
        bad = json.loads(json.dumps(MIN_GRAPH))
        bad["layout"] = "grid"
        with self.assertRaises(server.GraphError):
            server.validate_graph(bad)

    def test_rejects_bool_column(self) -> None:
        bad = json.loads(json.dumps(MIN_GRAPH))
        bad["nodes"][0]["column"] = True
        with self.assertRaises(server.GraphError):
            server.validate_graph(bad)

    def test_rejects_javascript_pr_url(self) -> None:
        bad = json.loads(json.dumps(MIN_GRAPH))
        bad["pr"]["url"] = "javascript:alert(1)"
        with self.assertRaises(server.GraphError):
            server.validate_graph(bad)

    def test_rejects_credentialed_pr_url(self) -> None:
        bad = json.loads(json.dumps(MIN_GRAPH))
        bad["pr"]["url"] = "https://user:pass@github.com/x/y/pull/1"
        with self.assertRaises(server.GraphError):
            server.validate_graph(bad)

    def test_write_and_cli_validate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session = Path(tmp)
            path = server.write_graph_file(session, MIN_GRAPH)
            self.assertTrue(path.is_file())
            server.main(["validate", "--session", str(session)])


class SidecarTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.session_dir = Path(self.tmp.name)
        server.write_graph_file(self.session_dir, MIN_GRAPH)
        graph = server.load_graph(self.session_dir / "graph.json")
        self.sess = server.Session(graph, token="test-token", heartbeat_grace=30, heartbeat_timeout=5)
        self.httpd = server.bind_server(
            self.sess, WEB, host="127.0.0.1", port=0, session_dir=self.session_dir
        )
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.port}"

    def tearDown(self) -> None:
        self.sess.request_shutdown()
        self.httpd.shutdown()
        self.httpd.server_close()
        self.tmp.cleanup()

    def req(self, method: str, path: str, body: dict | None = None, token: str | None = "test-token", origin: str | None = None):
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if origin:
            headers["Origin"] = origin
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=5) as resp:
                raw = resp.read().decode("utf-8")
                payload = json.loads(raw) if raw.strip().startswith("{") else raw
                return resp.status, payload
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8")
            payload = json.loads(raw) if raw.strip().startswith("{") else raw
            return exc.code, payload

    def test_bind_loopback_only(self) -> None:
        self.assertEqual(self.httpd.server_address[0], "127.0.0.1")

    def test_rejects_missing_token(self) -> None:
        code, payload = self.req("GET", "/graph.json", token=None)
        self.assertEqual(code, 401)
        self.assertEqual(payload["error"], "unauthorized")

    def test_config_js_requires_auth(self) -> None:
        code, payload = self.req("GET", "/config.js", token=None)
        self.assertEqual(code, 401)
        self.assertEqual(payload["error"], "unauthorized")

    def test_config_js_omits_token(self) -> None:
        code, payload = self.req("GET", "/config.js")
        self.assertEqual(code, 200)
        self.assertIn("heartbeatMs", payload)
        self.assertNotIn("token", payload)

    def test_index_unauthenticated_has_no_session_cookie(self) -> None:
        request = urllib.request.Request(self.base + "/")
        with urllib.request.urlopen(request, timeout=5) as resp:
            cookie = resp.headers.get("Set-Cookie") or ""
            self.assertNotIn("ir_session=", cookie)

    def test_rejects_bad_host(self) -> None:
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.putrequest("GET", "/graph.json", skip_host=True)
        conn.putheader("Host", "evil.example")
        conn.putheader("Authorization", "Bearer test-token")
        conn.endheaders()
        resp = conn.getresponse()
        body = resp.read()
        self.assertEqual(resp.status, 403)
        self.assertTrue(body)
        conn.close()

    def test_post_without_origin_or_bearer_forbidden(self) -> None:
        code, payload = self.req("POST", "/ui/heartbeat", body={}, token=None)
        self.assertEqual(code, 403)
        self.assertEqual(payload["error"], "forbidden origin")

    def test_rejects_bad_origin(self) -> None:
        code, payload = self.req(
            "POST",
            "/ui/heartbeat",
            body={},
            origin="https://evil.example",
        )
        self.assertEqual(code, 403)

    def test_graph_with_token(self) -> None:
        code, payload = self.req("GET", "/graph.json")
        self.assertEqual(code, 200)
        self.assertEqual(payload["title"], "Upload path")

    def test_reload_graph(self) -> None:
        updated = json.loads(json.dumps(MIN_GRAPH))
        updated["title"] = "Reloaded"
        server.write_graph_file(self.session_dir, updated)
        code, payload = self.req("POST", "/agent/reload-graph", body={})
        self.assertEqual(code, 200)
        self.assertTrue(payload["ok"])
        code, graph = self.req("GET", "/graph.json")
        self.assertEqual(code, 200)
        self.assertEqual(graph["title"], "Reloaded")

    def test_index_served(self) -> None:
        request = urllib.request.Request(self.base + "/")
        with urllib.request.urlopen(request, timeout=5) as resp:
            html = resp.read().decode("utf-8")
            self.assertIn("Interactive review", html)
            self.assertIn("/app.js", html)

    def test_ask_then_wait_then_answer(self) -> None:
        code, payload = self.req("POST", "/ui/ask", body={"node_id": "upload", "text": "What does this do?"})
        self.assertEqual(code, 200)
        ask_id = payload["ask_id"]
        code, waited = self.req("GET", "/agent/wait?timeout=2")
        self.assertEqual(code, 200)
        self.assertEqual(waited["type"], "ask")
        self.assertEqual(waited["ask_id"], ask_id)
        self.assertEqual(waited["node_id"], "upload")
        code, _ = self.req(
            "POST",
            "/agent/status",
            body={"ask_id": ask_id, "kind": "tool", "label": "Read", "detail": "upload_github_asset.py"},
        )
        self.assertEqual(code, 200)
        code, _ = self.req(
            "POST",
            "/agent/answer",
            body={
                "ask_id": ask_id,
                "markdown": "It hosts the PNG.",
                "citations": [{"path": "skills/pr-figure/scripts/upload_github_asset.py"}],
                "follow_ups": ["Who calls it?"],
                "unknown": False,
            },
        )
        self.assertEqual(code, 200)

    def test_idle_wait(self) -> None:
        code, payload = self.req("GET", "/agent/wait?timeout=1")
        self.assertEqual(code, 200)
        self.assertEqual(payload["type"], "idle")

    def test_stop_unblocks_wait(self) -> None:
        def stopper() -> None:
            time.sleep(0.2)
            self.req("POST", "/ui/stop", body={})

        threading.Thread(target=stopper, daemon=True).start()
        code, payload = self.req("GET", "/agent/wait?timeout=5")
        self.assertEqual(code, 200)
        self.assertEqual(payload["type"], "shutdown")

    def test_refuses_non_loopback_bind(self) -> None:
        with self.assertRaises(ValueError):
            server.bind_server(self.sess, WEB, host="0.0.0.0", port=0)


if __name__ == "__main__":
    unittest.main()
