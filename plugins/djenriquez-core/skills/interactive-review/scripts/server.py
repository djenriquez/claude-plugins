#!/usr/bin/env python3
"""Local sidecar for /interactive-review. Stdlib only. Binds 127.0.0.1."""

from __future__ import annotations

import argparse
import json
import os
import queue
import secrets
import sys
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse


EDGE_KINDS = frozenset({"control", "data-happy", "data-other", "once"})
SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_WEB = SKILL_DIR / "web"
MAX_BODY = 256 * 1024
COOKIE = "ir_session"
ALLOWED_URL_SCHEMES = frozenset({"http", "https"})
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self' data:; connect-src 'self'; form-action 'self'; "
        "base-uri 'none'; frame-ancestors 'none'"
    ),
}


class GraphError(ValueError):
    """Invalid scene graph."""


def tmp_root() -> Path:
    return Path(os.environ.get("TMPDIR") or "/tmp")


def init_session() -> Path:
    return Path(tempfile.mkdtemp(prefix="ir-", dir=str(tmp_root())))


def _require_dict(value: Any, what: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise GraphError(f"{what} must be an object")
    return value


def _require_str(value: Any, what: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise GraphError(f"{what} must be a non-empty string")
    return value.strip()


def _opt_str(value: Any, what: str) -> str | None:
    if value is None:
        return None
    return _require_str(value, what)


def _string_list(raw: Any, what: str, *, max_items: int) -> list[str]:
    if raw is None:
        return []
    if not isinstance(raw, list) or not all(isinstance(x, str) for x in raw):
        raise GraphError(f"{what} must be an array of strings")
    if len(raw) > max_items:
        raise GraphError(f"{what} has at most {max_items} entries")
    return [x.strip() for x in raw if x.strip()]


def _parse_sections(raw: Any, prefix: str) -> list[dict[str, Any]]:
    if not raw:
        return []
    if not isinstance(raw, list):
        raise GraphError(f"{prefix} must be an array")
    if len(raw) > 6:
        raise GraphError(f"{prefix} has at most 6 entries")
    out: list[dict[str, Any]] = []
    for j, item in enumerate(raw):
        sec = _require_dict(item, f"{prefix}[{j}]")
        kind = _opt_str(sec.get("kind"), f"{prefix}[{j}].kind")
        if kind and kind not in EDGE_KINDS:
            raise GraphError(f"{prefix}[{j}].kind must be one of {sorted(EDGE_KINDS)}")
        row: dict[str, Any] = {
            "title": _require_str(sec.get("title"), f"{prefix}[{j}].title"),
            "bullets": _string_list(sec.get("bullets"), f"{prefix}[{j}].bullets", max_items=16),
        }
        if kind:
            row["kind"] = kind
        out.append(row)
    return out


def _require_http_url(value: Any, what: str) -> str:
    raw = _require_str(value, what)
    parsed = urlparse(raw)
    if parsed.scheme not in ALLOWED_URL_SCHEMES or not parsed.netloc:
        raise GraphError(f"{what} must be an http(s) URL")
    if parsed.username or parsed.password:
        raise GraphError(f"{what} must not contain credentials")
    return raw


def validate_graph(data: Any) -> dict[str, Any]:
    graph = _require_dict(data, "graph")
    title = _require_str(graph.get("title"), "title")
    pr = _require_dict(graph.get("pr"), "pr")
    pr_url = _require_http_url(pr.get("url"), "pr.url")
    if not isinstance(pr.get("number"), int) or pr["number"] <= 0:
        raise GraphError("pr.number must be a positive integer")
    _require_str(pr.get("title"), "pr.title")
    layout = graph.get("layout") or "landscape"
    if layout not in {"landscape", "rows"}:
        raise GraphError("layout must be landscape or rows")
    summary_raw = _require_dict(graph.get("summary"), "summary")
    problem = _require_str(summary_raw.get("problem"), "summary.problem")
    change = _require_str(summary_raw.get("change"), "summary.change")
    if len(problem) > 800:
        raise GraphError("summary.problem must be at most 800 characters")
    if len(change) > 800:
        raise GraphError("summary.change must be at most 800 characters")

    bands_raw = graph.get("bands")
    if bands_raw is None:
        bands_raw = []
    if not isinstance(bands_raw, list):
        raise GraphError("bands must be an array")
    band_ids: set[str] = set()
    bands: list[dict[str, str]] = []
    for i, item in enumerate(bands_raw):
        band = _require_dict(item, f"bands[{i}]")
        band_id = _require_str(band.get("id"), f"bands[{i}].id")
        if band_id in band_ids:
            raise GraphError(f"duplicate band id {band_id!r}")
        band_ids.add(band_id)
        bands.append({"id": band_id, "label": _require_str(band.get("label"), f"bands[{i}].label")})

    nodes_raw = graph.get("nodes")
    if not isinstance(nodes_raw, list) or not nodes_raw:
        raise GraphError("nodes must be a non-empty array")
    node_ids: set[str] = set()
    nodes: list[dict[str, Any]] = []
    for i, item in enumerate(nodes_raw):
        node = _require_dict(item, f"nodes[{i}]")
        node_id = _require_str(node.get("id"), f"nodes[{i}].id")
        if node_id in node_ids:
            raise GraphError(f"duplicate node id {node_id!r}")
        node_ids.add(node_id)
        band = _opt_str(node.get("band"), f"nodes[{i}].band")
        if band and band_ids and band not in band_ids:
            raise GraphError(f"nodes[{i}].band {band!r} is not a band id")
        column = node.get("column")
        if column is not None and (not isinstance(column, int) or isinstance(column, bool) or column < 0):
            raise GraphError(f"nodes[{i}].column must be a non-negative integer")
        bullets = _string_list(node.get("bullets"), f"nodes[{i}].bullets", max_items=16)
        subtitle = _opt_str(node.get("subtitle"), f"nodes[{i}].subtitle")
        sections = _parse_sections(node.get("sections"), f"nodes[{i}].sections")
        evidence_raw = node.get("evidence") or []
        if not isinstance(evidence_raw, list):
            raise GraphError(f"nodes[{i}].evidence must be an array")
        evidence: list[dict[str, Any]] = []
        for j, ev in enumerate(evidence_raw):
            row = _require_dict(ev, f"nodes[{i}].evidence[{j}]")
            entry: dict[str, Any] = {"path": _require_str(row.get("path"), f"nodes[{i}].evidence[{j}].path")}
            if "start_line" in row and row["start_line"] is not None:
                if not isinstance(row["start_line"], int) or row["start_line"] <= 0:
                    raise GraphError(f"nodes[{i}].evidence[{j}].start_line must be a positive integer")
                entry["start_line"] = row["start_line"]
            if "end_line" in row and row["end_line"] is not None:
                if not isinstance(row["end_line"], int) or row["end_line"] <= 0:
                    raise GraphError(f"nodes[{i}].evidence[{j}].end_line must be a positive integer")
                entry["end_line"] = row["end_line"]
            evidence.append(entry)
        entry: dict[str, Any] = {
            "id": node_id,
            "label": _require_str(node.get("label"), f"nodes[{i}].label"),
            "band": band,
            "role": _require_str(node.get("role"), f"nodes[{i}].role"),
            "evidence": evidence,
        }
        if column is not None:
            entry["column"] = column
        if subtitle:
            entry["subtitle"] = subtitle
        if bullets:
            entry["bullets"] = bullets
        if sections:
            entry["sections"] = sections
        nodes.append(entry)

    edges_raw = graph.get("edges")
    if edges_raw is None:
        edges_raw = []
    if not isinstance(edges_raw, list):
        raise GraphError("edges must be an array")
    edge_ids: set[str] = set()
    edges: list[dict[str, Any]] = []
    for i, item in enumerate(edges_raw):
        edge = _require_dict(item, f"edges[{i}]")
        edge_id = _require_str(edge.get("id"), f"edges[{i}].id")
        if edge_id in edge_ids:
            raise GraphError(f"duplicate edge id {edge_id!r}")
        edge_ids.add(edge_id)
        src = _require_str(edge.get("from"), f"edges[{i}].from")
        dst = _require_str(edge.get("to"), f"edges[{i}].to")
        if src not in node_ids:
            raise GraphError(f"edges[{i}].from {src!r} is not a node id")
        if dst not in node_ids:
            raise GraphError(f"edges[{i}].to {dst!r} is not a node id")
        kind = _require_str(edge.get("kind"), f"edges[{i}].kind")
        if kind not in EDGE_KINDS:
            raise GraphError(f"edges[{i}].kind must be one of {sorted(EDGE_KINDS)}")
        edges.append(
            {
                "id": edge_id,
                "from": src,
                "to": dst,
                "kind": kind,
                "label": _opt_str(edge.get("label"), f"edges[{i}].label"),
            }
        )

    do_not_draw = graph.get("do_not_draw") or []
    if not isinstance(do_not_draw, list) or not all(isinstance(x, str) for x in do_not_draw):
        raise GraphError("do_not_draw must be an array of strings")
    annotations = graph.get("annotations") or []
    if not isinstance(annotations, list) or not all(isinstance(x, str) for x in annotations):
        raise GraphError("annotations must be an array of strings")

    return {
        "title": title,
        "pr": {
            "url": pr_url,
            "number": pr["number"],
            "title": pr["title"].strip(),
        },
        "layout": layout,
        "summary": {"problem": problem, "change": change},
        "bands": bands,
        "nodes": nodes,
        "edges": edges,
        "do_not_draw": [x.strip() for x in do_not_draw if x.strip()],
        "annotations": [x.strip() for x in annotations if x.strip()],
    }


def load_graph(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise GraphError(f"invalid JSON: {exc}") from exc
    return validate_graph(data)


def write_graph_file(session_dir: Path, data: Any) -> Path:
    graph = validate_graph(data)
    session_dir.mkdir(parents=True, exist_ok=True)
    path = session_dir / "graph.json"
    path.write_text(json.dumps(graph, indent=2) + "\n", encoding="utf-8")
    return path


class Session:
    def __init__(
        self,
        graph: dict[str, Any],
        *,
        token: str | None = None,
        heartbeat_grace: float = 120.0,
        heartbeat_timeout: float = 45.0,
    ) -> None:
        self.graph = graph
        self.token = token or secrets.token_urlsafe(24)
        self.heartbeat_grace = heartbeat_grace
        self.heartbeat_timeout = heartbeat_timeout
        self.started = time.monotonic()
        self.last_heartbeat: float | None = None
        self.shutdown = False
        self.ask_queue: queue.Queue[dict[str, Any] | None] = queue.Queue()
        self.sse_queues: list[queue.Queue[dict[str, Any] | None]] = []
        self.lock = threading.Lock()

    def heartbeat_expired(self) -> bool:
        now = time.monotonic()
        if self.last_heartbeat is None:
            return (now - self.started) > self.heartbeat_grace
        return (now - self.last_heartbeat) > self.heartbeat_timeout

    def maybe_timeout(self) -> None:
        if not self.shutdown and self.heartbeat_expired():
            self.request_shutdown()

    def request_shutdown(self) -> None:
        with self.lock:
            if self.shutdown:
                return
            self.shutdown = True
        self.ask_queue.put(None)
        self.broadcast("shutdown", {})

    def touch_heartbeat(self) -> None:
        self.last_heartbeat = time.monotonic()

    def add_sse(self) -> queue.Queue[dict[str, Any] | None]:
        q: queue.Queue[dict[str, Any] | None] = queue.Queue()
        with self.lock:
            self.sse_queues.append(q)
        return q

    def drop_sse(self, q: queue.Queue[dict[str, Any] | None]) -> None:
        with self.lock:
            if q in self.sse_queues:
                self.sse_queues.remove(q)

    def broadcast(self, event: str, data: dict[str, Any]) -> None:
        payload = {"event": event, "data": data}
        with self.lock:
            targets = list(self.sse_queues)
        for q in targets:
            q.put(payload)

    def enqueue_ask(self, node_id: str | None, text: str) -> str:
        ask_id = str(uuid.uuid4())
        item = {"type": "ask", "ask_id": ask_id, "node_id": node_id, "text": text}
        self.ask_queue.put(item)
        return ask_id

    def wait(self, timeout: float) -> dict[str, Any]:
        self.maybe_timeout()
        if self.shutdown:
            return {"type": "shutdown"}
        try:
            item = self.ask_queue.get(timeout=timeout)
        except queue.Empty:
            self.maybe_timeout()
            if self.shutdown:
                return {"type": "shutdown"}
            return {"type": "idle"}
        if item is None:
            return {"type": "shutdown"}
        return item


def _cookie_token(header: str) -> str | None:
    for part in header.split(";"):
        name, _, value = part.strip().partition("=")
        if name == COOKIE:
            return value or None
    return None


def _read_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length") or "0")
    if length < 0 or length > MAX_BODY:
        raise ValueError("body too large")
    raw = handler.rfile.read(length) if length else b"{}"
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("JSON body must be an object")
    return data


def safe_file(root: Path, rel: str) -> Path | None:
    if not rel or rel.endswith("/"):
        rel = rel + "index.html"
    candidate = (root / rel).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    if not candidate.is_file():
        return None
    return candidate


MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


def make_handler(
    session: Session,
    web_dir: Path,
    port: int,
    session_dir: Path | None = None,
) -> type[BaseHTTPRequestHandler]:
    expected_origin = f"http://127.0.0.1:{port}"

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt: str, *args: Any) -> None:
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

        def _authorized(self) -> bool:
            auth = self.headers.get("Authorization", "")
            if auth == f"Bearer {session.token}":
                return True
            cookie = _cookie_token(self.headers.get("Cookie", ""))
            if cookie == session.token:
                return True
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            token = (qs.get("token") or [None])[0]
            return token == session.token

        def _host_ok(self) -> bool:
            raw = self.headers.get("Host") or ""
            if not raw or "/" in raw or "\\" in raw or raw.startswith("["):
                return False
            name, sep, port = raw.partition(":")
            if not sep:
                return name == "127.0.0.1"
            return name == "127.0.0.1" and port.isdigit()

        def _origin_ok(self) -> bool:
            origin = self.headers.get("Origin")
            if origin:
                return origin == expected_origin
            return self.headers.get("Authorization", "") == f"Bearer {session.token}"

        def _set_cookie(self) -> None:
            self.send_header(
                "Set-Cookie",
                f"{COOKIE}={session.token}; Path=/; HttpOnly; SameSite=Strict",
            )

        def _security_headers(self) -> None:
            for key, value in SECURITY_HEADERS.items():
                self.send_header(key, value)

        def _send(self, code: int, body: bytes, content_type: str, extra: dict[str, str] | None = None) -> None:
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self._security_headers()
            if extra:
                for key, value in extra.items():
                    self.send_header(key, value)
            self.end_headers()
            self.wfile.write(body)

        def _send_json(self, code: int, payload: dict[str, Any]) -> None:
            body = (json.dumps(payload) + "\n").encode("utf-8")
            self._send(code, body, "application/json; charset=utf-8")

        def _reject_auth(self) -> None:
            self._send_json(401, {"error": "unauthorized"})

        def do_GET(self) -> None:  # noqa: N802
            if not self._host_ok():
                self._send_json(403, {"error": "forbidden host"})
                return
            parsed = urlparse(self.path)
            path = parsed.path
            if path == "/config.js":
                if not self._authorized():
                    self._reject_auth()
                    return
                body = f"window.IR = {json.dumps({'heartbeatMs': 5000})};\n".encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self._security_headers()
                self._set_cookie()
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/graph.json":
                if not self._authorized():
                    self._reject_auth()
                    return
                body = (json.dumps(session.graph) + "\n").encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self._security_headers()
                self._set_cookie()
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/ui/events":
                if not self._authorized():
                    self._reject_auth()
                    return
                self._sse()
                return
            if path == "/agent/wait":
                if not self._authorized():
                    self._reject_auth()
                    return
                qs = parse_qs(parsed.query)
                try:
                    timeout = float((qs.get("timeout") or ["25"])[0])
                except ValueError:
                    timeout = 25.0
                timeout = min(max(timeout, 1.0), 60.0)
                payload = session.wait(timeout)
                self._send_json(200, payload)
                return
            if path == "/":
                path = "/index.html"
            rel = path.lstrip("/")
            file_path = safe_file(web_dir, rel)
            if file_path is None:
                self._send_json(404, {"error": "not found"})
                return
            body = file_path.read_bytes()
            content_type = MIME.get(file_path.suffix.lower(), "application/octet-stream")
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self._security_headers()
            if file_path.name == "index.html" and self._authorized():
                self._set_cookie()
            self.end_headers()
            self.wfile.write(body)

        def _sse(self) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self._security_headers()
            self._set_cookie()
            self.end_headers()
            q = session.add_sse()
            try:
                hello = {"event": "hello", "data": {"ok": True, "shutdown": session.shutdown}}
                self._sse_write(hello)
                while not session.shutdown:
                    try:
                        item = q.get(timeout=15.0)
                    except queue.Empty:
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
                        continue
                    if item is None:
                        break
                    self._sse_write(item)
                    if item.get("event") == "shutdown":
                        break
            except BrokenPipeError:
                pass
            finally:
                session.drop_sse(q)

        def _sse_write(self, item: dict[str, Any]) -> None:
            event = item.get("event") or "message"
            data = json.dumps(item.get("data") or {})
            self.wfile.write(f"event: {event}\ndata: {data}\n\n".encode("utf-8"))
            self.wfile.flush()

        def do_POST(self) -> None:  # noqa: N802
            if not self._host_ok():
                self._send_json(403, {"error": "forbidden host"})
                return
            parsed = urlparse(self.path)
            path = parsed.path
            if not self._origin_ok():
                self._send_json(403, {"error": "forbidden origin"})
                return
            if not self._authorized():
                self._reject_auth()
                return
            try:
                body = _read_json(self)
            except (ValueError, json.JSONDecodeError) as exc:
                self._send_json(400, {"error": str(exc)})
                return
            if path == "/ui/heartbeat":
                session.touch_heartbeat()
                self._send_json(200, {"ok": True})
                return
            if path == "/ui/stop":
                session.request_shutdown()
                self._send_json(200, {"ok": True})
                return
            if path == "/ui/ask":
                text = body.get("text")
                if not isinstance(text, str) or not text.strip():
                    self._send_json(400, {"error": "text is required"})
                    return
                node_id = body.get("node_id")
                if node_id is not None and not isinstance(node_id, str):
                    self._send_json(400, {"error": "node_id must be a string or null"})
                    return
                if session.shutdown:
                    self._send_json(409, {"error": "session stopped"})
                    return
                ask_id = session.enqueue_ask(node_id, text.strip())
                self._send_json(200, {"ask_id": ask_id})
                return
            if path == "/agent/reload-graph":
                if session_dir is None:
                    self._send_json(500, {"error": "no session dir"})
                    return
                try:
                    session.graph = load_graph(session_dir / "graph.json")
                except (OSError, GraphError) as exc:
                    self._send_json(400, {"error": str(exc)})
                    return
                session.broadcast("graph", {"ok": True})
                self._send_json(200, {"ok": True})
                return
            if path == "/agent/status":
                ask_id = body.get("ask_id")
                kind = body.get("kind")
                label = body.get("label")
                if not isinstance(ask_id, str) or not isinstance(kind, str) or not isinstance(label, str):
                    self._send_json(400, {"error": "ask_id, kind, and label are required"})
                    return
                if kind not in {"thinking", "tool", "text"}:
                    self._send_json(400, {"error": "kind must be thinking, tool, or text"})
                    return
                detail = body.get("detail")
                event = {
                    "ask_id": ask_id,
                    "kind": kind,
                    "label": label,
                    "detail": detail if isinstance(detail, str) else None,
                }
                session.broadcast("status", event)
                self._send_json(200, {"ok": True})
                return
            if path == "/agent/answer":
                ask_id = body.get("ask_id")
                markdown = body.get("markdown")
                if not isinstance(ask_id, str) or not isinstance(markdown, str):
                    self._send_json(400, {"error": "ask_id and markdown are required"})
                    return
                citations = body.get("citations") or []
                follow_ups = body.get("follow_ups") or []
                if not isinstance(citations, list) or not isinstance(follow_ups, list):
                    self._send_json(400, {"error": "citations and follow_ups must be arrays"})
                    return
                unknown = bool(body.get("unknown"))
                session.broadcast(
                    "answer",
                    {
                        "ask_id": ask_id,
                        "markdown": markdown,
                        "citations": citations,
                        "follow_ups": [x for x in follow_ups if isinstance(x, str)][:3],
                        "unknown": unknown,
                    },
                )
                self._send_json(200, {"ok": True})
                return
            self._send_json(404, {"error": "not found"})

    return Handler


def bind_server(
    session: Session,
    web_dir: Path,
    *,
    host: str = "127.0.0.1",
    port: int = 0,
    session_dir: Path | None = None,
) -> ThreadingHTTPServer:
    if host != "127.0.0.1":
        raise ValueError("sidecar must bind 127.0.0.1")
    handler = make_handler(session, web_dir, 0, session_dir)

    class Server(ThreadingHTTPServer):
        allow_reuse_address = True
        daemon_threads = True

    httpd = Server((host, port), handler)
    real_port = httpd.server_address[1]
    httpd.RequestHandlerClass = make_handler(session, web_dir, real_port, session_dir)
    return httpd


def serve(session_dir: Path, web_dir: Path, *, heartbeat_grace: float = 120.0, heartbeat_timeout: float = 45.0) -> None:
    graph = load_graph(session_dir / "graph.json")
    session = Session(graph, heartbeat_grace=heartbeat_grace, heartbeat_timeout=heartbeat_timeout)
    httpd = bind_server(session, web_dir, session_dir=session_dir)
    port = httpd.server_address[1]
    info = {
        "url": f"http://127.0.0.1:{port}/?token={session.token}",
        "token": session.token,
        "port": port,
        "session_dir": str(session_dir),
    }
    (session_dir / "server.json").write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")
    sys.stdout.write(json.dumps(info) + "\n")
    sys.stdout.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        session.request_shutdown()
    finally:
        httpd.server_close()


def _session_dir(ns: argparse.Namespace) -> Path:
    if not ns.session:
        raise SystemExit(" --session is required")
    return Path(ns.session).expanduser()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="interactive-review sidecar")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init", help="create a temp session directory")

    p_write = sub.add_parser("write-graph", help="validate stdin JSON into session/graph.json")
    p_write.add_argument("--session", required=True)

    p_val = sub.add_parser("validate", help="validate session/graph.json")
    p_val.add_argument("--session", required=True)

    p_serve = sub.add_parser("serve", help="serve the SPA on 127.0.0.1")
    p_serve.add_argument("--session", required=True)
    p_serve.add_argument("--web", default=str(DEFAULT_WEB))
    p_serve.add_argument("--heartbeat-grace", type=float, default=120.0)
    p_serve.add_argument("--heartbeat-timeout", type=float, default=45.0)

    ns = parser.parse_args(argv)
    if ns.cmd == "init":
        print(init_session())
        return
    if ns.cmd == "write-graph":
        raw = sys.stdin.read()
        try:
            data = json.loads(raw)
            path = write_graph_file(_session_dir(ns), data)
        except (json.JSONDecodeError, GraphError) as exc:
            raise SystemExit(f"write-graph: {exc}") from exc
        print(path)
        return
    if ns.cmd == "validate":
        path = _session_dir(ns) / "graph.json"
        try:
            validate_graph(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError, GraphError) as exc:
            raise SystemExit(f"validate: {exc}") from exc
        print("ok")
        return
    if ns.cmd == "serve":
        web = Path(ns.web)
        if not (web / "index.html").is_file():
            raise SystemExit(f"serve: missing {web / 'index.html'}")
        serve(
            _session_dir(ns),
            web,
            heartbeat_grace=ns.heartbeat_grace,
            heartbeat_timeout=ns.heartbeat_timeout,
        )


if __name__ == "__main__":
    main()
