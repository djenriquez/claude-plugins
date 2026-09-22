---
name: interactive-review
description: >
  Opens a localhost interactive diagram of a pull request so a developer can
  click components and ask follow-up questions answered by the same agent
  session. Use when the user wants an interactive review, to explore a PR
  visually, to drill into a /pr-figure-style overview, or says /interactive-review.
  Not for posting GitHub figures (use /pr-figure) or producing review verdicts
  (use /code-review).
argument-hint: "[PR URL|#N]"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Bash(python3:*)
  - Bash(curl:*)
  - Read
  - Glob
  - Grep
  - AskUserQuestion
---

# Interactive Review

Local comprehension map for one pull request. The page is a proxy. This
session is the brain. Read-only. No GitHub hosting.

Load `references/interactive-review.md` and `references/github-pr-workflow.md`
before starting. Load `references/reporting-style.md` and
`references/humanizer-patterns.md` before writing graph prose and before each
answer. Load `references/pr-figure.md` only for skip rules and what to draw
(actors, arrows, bands). Do not generate a PNG and do not upload.

`$ARGUMENTS` is a PR reference (`#N`, `N`, or URL). If omitted, use the
current branch’s PR. Do not guess a number from history.

## Invariants

- **localhost-only** / **localhost-csrf**: sidecar on `127.0.0.1`; `Host`
  must be `127.0.0.1`; POST without a bearer token requires
  `Origin: http://127.0.0.1:<port>`. Open the printed `url` (includes
  `?token=`). Do not curl any host except that sidecar.
- **proxy-sidecar**: the page does not call a model.
- **launching-agent**: answers come from this session only.
- **occupy-session**: after the URL is printed, this chat is this skill
  until shutdown. Do not do other work in parallel.
- **read-only**: inspect with `Read` / `Grep` / `Glob`, `gh pr view`,
  `gh pr diff`, `git diff`. No working-tree edits, `git commit` / `push`,
  or `gh pr comment` / `gh api` mutations from page events.
- **grounding**: no invented boxes, arrows, or claims. Unknown → say so.
- **human-voice**: graph summary, roles/annotations, and every panel answer
  get the required `digest` humanizer pass (inline Process; nested
  `/humanizer` optional). Outcome first, one name per thing, natural
  contractions OK. Do not POST or draw the raw draft.
- **no-verdict**: explain; do not approve or reject.
- **no-host**: do not commit the page or upload it.
- **skip-trivial**: nothing to draw → stop, no sidecar.

`scripts/server.py` and `web/` are skill-local: resolve them from the
directory that contains this `SKILL.md`, not from the repo root.
Unqualified `references/` is the plugin root.

## Process

1. Resolve the PR (`references/github-pr-workflow.md`). Prefer the PR’s
   `OWNER/REPO`. Checkout is optional.
2. Gather title, body, changed files, and the base-branch diff (`gh pr diff`
   or `git diff <base>...HEAD` when this checkout is the head). Read the
   most important core files (not a test/config dump).
3. If `pr-figure` would skip for nothing to draw, say so and stop.
4. Fill the `pr-figure` prompt skeleton from that evidence (actors with
   nested internals, both arrow bands, annotations, do-not-draw). Map it
   onto `graph.json` 1:1: every numbered actor is a node; nested bullets
   stay on the canvas (`bullets` / `sections`), not only in `role`. Default
   `layout` is `landscape` (bands as columns, left to right). Do not thin
   the figure for the SPA. Put distinct outcomes on distinct edges. Write
   `summary.problem` (what is wrong today) and `summary.change` (what this
   PR does about it) in digest voice, then roles and annotations. Leave
   field lists verbatim. Humanize those prose strings before `write-graph`.
5. Session dir and sidecar (`IR_ROOT` = this skill’s directory):

   ```sh
   SESSION_DIR=$(python3 "$IR_ROOT/scripts/server.py" init)
   python3 "$IR_ROOT/scripts/server.py" write-graph --session "$SESSION_DIR"  # stdin: graph JSON
   python3 "$IR_ROOT/scripts/server.py" validate --session "$SESSION_DIR"
   python3 "$IR_ROOT/scripts/server.py" serve --session "$SESSION_DIR"
   ```

   Start `serve` in the background. Read `$SESSION_DIR/server.json` (also
   printed as one JSON line on stdout) for `url`, `token`, and `port`. Tell
   the user to open `url`. Occupancy starts now. If `graph.json` is rewritten
   later, `POST /agent/reload-graph` and keep the same sidecar.
6. Watch loop until shutdown:

   ```sh
   curl -sS -H "Authorization: Bearer $TOKEN" \
     "http://127.0.0.1:$PORT/agent/wait?timeout=25"
   ```

   - `idle` → wait again.
   - `shutdown` → kill `serve`, stop.
   - `ask` → answer that turn (below), then wait again.

   Posting an answer does not end the session. Call `wait` again right away
   instead of ending the turn with a recap; only `shutdown` ends the loop.

## Answer a turn

`node_id` is the scope; `null` is the whole change. Use `Read` / `Grep` /
`Glob` / `gh` as needed. Post status while working, then the answer:

```sh
curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ask_id":"...","kind":"tool","label":"Read","detail":"path"}' \
  "http://127.0.0.1:$PORT/agent/status"

curl -sS -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ask_id":"...","markdown":"...","citations":[],"follow_ups":[],"unknown":false}' \
  "http://127.0.0.1:$PORT/agent/answer"
```

Draft the answer, then run the required `digest` humanizer pass on
`markdown` and `follow_ups` before POST. Lead with the outcome. One name
per thing. Contractions are fine. Follow-ups are real next questions, not
“want me to dive deeper.” Cite only paths just read or listed on the
node’s `evidence`. HTML-safe plain markdown. Optional `follow_ups` (at
most three). If evidence is missing, `unknown: true`.

## Output

```text
Interactive review: http://127.0.0.1:<port>/?token=<token>
PR: <url>
```
