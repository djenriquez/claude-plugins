# Interactive Review Reference

Load this from `/interactive-review` only. Drawing intent and skip rules
stay in `references/pr-figure.md`. Pull-request resolve stays in
`references/github-pr-workflow.md`. This file is the scene graph, sidecar
HTTP, watch loop, and answer contract.

## Skip

Skip without starting the sidecar when `references/pr-figure.md` would skip
for “nothing to draw” (lockfile, format-only, typo, generated-only). There
is no image-generator skip: this skill does not paint a PNG.

## Scene graph

Write `graph.json` in the session directory. Validate with
`scripts/server.py validate` before serve. Every node, edge, and role
sentence must appear in the gathered PR evidence. If a name is not in that
evidence, omit it.

```json
{
  "title": "short figure title",
  "pr": {
    "url": "https://github.com/OWNER/REPO/pull/N",
    "number": 1,
    "title": "PR title"
  },
  "bands": [{ "id": "control", "label": "Control plane" }],
  "nodes": [
    {
      "id": "upload",
      "label": "Upload script",
      "band": "control",
      "role": "one or two sentences, end-state, grounded",
      "subtitle": "optional one-line caption",
      "column": 0,
      "bullets": ["nested figure bullet"],
      "sections": [
        { "title": "Legacy scalars", "kind": "data-happy", "bullets": ["image"] }
      ],
      "evidence": [
        { "path": "skills/foo.py", "start_line": 10, "end_line": 40 }
      ]
    }
  ],
  "edges": [
    {
      "id": "e1",
      "from": "upload",
      "to": "comment",
      "kind": "control",
      "label": "optional"
    }
  ],
  "do_not_draw": ["rejected sibling when lookalikes exist"],
  "annotations": ["invariant a reviewer would miss"],
  "layout": "landscape",
  "summary": {
    "problem": "what is wrong today, in one or two sentences",
    "change": "what this PR does about it, in one or two sentences"
  }
}
```

Rules from `pr-figure`, applied to JSON not pixels:

- Fill the same prompt skeleton, then map it 1:1. Nested actor bullets
  belong on the canvas. Do not keep a thinner “SPA version” of the figure.
  Lead the page with `summary` so a reviewer sees the problem and the
  change before reading boxes.
- Merged end state relative to the base branch. No implementation journey,
  discarded designs, or future work.
- `layout`: `landscape` (default; bands are columns, left to right, matching
  the PNG) or `rows` (bands as horizontal lanes).
- `kind`: `control`, `data-happy`, `data-other`, or `once`.
- Labels: one to three words. Quote verbatim strings that must appear.
- Component names, not function, type, or file-path box labels.
- Distinct outcomes on distinct edges. Same `from`/`to` pair is fanned;
  do not stack three labels on one shaft. Reverse edges route around every
  box in the span. Labels sit in gutters, not on cards.
- Edge `from` / `to` must be node `id`s. Node `band` should match a band
  `id` when bands are present.
- Optional `column` (non-negative int) aligns a node in `rows` layout.
- Optional `subtitle`, `bullets`, and `sections` carry the same internals a
  `/pr-figure` would print inside an actor. Field lists stay verbatim.
- `annotations` render as callouts on the canvas.
- `do_not_draw` is required when the change is easy to confuse with a
  sibling design.
- Humanize `summary`, `role`, `annotations`, and panel answers. Do not rewrite
  identifier bullets into prose.
- `summary.problem` is the gap on the base branch. `summary.change` is what
  this PR does about it. Both render at the top of the page.

## Sidecar CLI

Skill-local: `skills/interactive-review/scripts/server.py` (next to this
skill’s `SKILL.md`, not under plugin-root `references/`).

```sh
python3 scripts/server.py init
python3 scripts/server.py write-graph --session "$SESSION_DIR"
python3 scripts/server.py validate --session "$SESSION_DIR"
python3 scripts/server.py serve --session "$SESSION_DIR"
```

`init` prints the session directory (under `$TMPDIR` or `/tmp`).
`write-graph` reads JSON on stdin. `serve` binds `127.0.0.1` with port `0`, writes `server.json` in the
session directory (`url`, `token`, `port`, `session_dir`), prints the same
JSON object on stdout, then runs until killed.

Web assets: `skills/interactive-review/web/`.

## HTTP

`Host` must be `127.0.0.1` (with or without the port). Mutating routes and
`/agent/*` require `Authorization: Bearer <token>` (the agent) or the
`ir_session` cookie (the page). Browser POST must send
`Origin: http://127.0.0.1:<port>`; agent POST uses the bearer token and
omits `Origin`. `/config.js` and `/graph.json` require auth and do not
embed the token in JavaScript. The printed `url` is
`http://127.0.0.1:<port>/?token=<token>` so the first document load can
set the cookie.

Heartbeat: the page may take up to 120s to open. After the first
heartbeat, a 1h miss shuts the session down. Stop still shuts it down
immediately.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | SPA |
| GET | `/config.js` | heartbeat config (auth required; no token in JS) |
| GET | `/graph.json` | scene graph |
| GET | `/ui/events` | SSE |
| POST | `/ui/ask` | `{ "node_id": string\|null, "text": string }` |
| POST | `/ui/heartbeat` | keep-alive |
| POST | `/ui/stop` | shutdown |
| GET | `/agent/wait?timeout=25` | `{ "type": "ask"\|"shutdown"\|"idle" }` |
| POST | `/agent/reload-graph` | re-read `graph.json`; SSE `graph` |
| POST | `/agent/status` | `{ "ask_id", "kind", "label", "detail"? }` |
| POST | `/agent/answer` | answer JSON |

`kind` on status: `thinking`, `tool`, or `text`.

Answer JSON:

```json
{
  "ask_id": "…",
  "markdown": "plain explanation",
  "citations": [
    { "path": "foo.py", "start_line": 10, "end_line": 20 }
  ],
  "follow_ups": ["optional next question"],
  "unknown": false
}
```

Citations must be files read this turn or listed on the selected node’s
`evidence`. The page escapes HTML. `unknown: true` when the evidence does
not support an answer.

## Watch loop

Occupy the session after printing the URL.

1. `GET /agent/wait?timeout=25` with the bearer token.
2. `idle` → wait again. Do not invent work.
3. `shutdown` → kill the serve process, stop.
4. `ask` → scope to `node_id` (`null` = whole change). Post `thinking` /
   `tool` status as tools run. `POST /agent/answer`. Loop.

Read-only: `Read`, `Grep`, `Glob`, `gh`/`git` inspect. No repo writes, no
commit, no push, no PR comments from this loop.

Grounding: if it is not in the gathered evidence or a file just read, say
so. Explain the change without approve/reject advice. Humanize `markdown` and
`follow_ups` in `digest` mode before POST.

If `graph.json` is rewritten after serve, `POST /agent/reload-graph` then
the page refetches.

## UI

Bar: clickable boxes and arrows, hover highlight, select + dim, zoom/pan,
node brief from the graph (no model), composer, tool chips, citations,
follow-up chips, annotation callouts, fanned parallel-edge labels.

Stretch: thinking traces, `@` mentions, cited hunk preview. Cut rather
than fake. No marketing 3D.
