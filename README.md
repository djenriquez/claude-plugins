# djenriquez agent plugins

Agent workflow plugins by [@djenriquez](https://github.com/djenriquez), packaged for Claude Code and Codex (Cursor reads the same `SKILL.md` files).

## Installation

### Claude Code

```
/plugin marketplace add djenriquez/claude-plugins
/plugin install djenriquez-core
```

### Codex

Codex marketplace metadata lives at:

```
.agents/plugins/marketplace.json
```

The `djenriquez-core` entry points to:

```
./plugins/djenriquez-core
```

Install `djenriquez-core` from that Codex marketplace entry after this repository is available as a Codex plugin marketplace/source.

## Skills

Skills are invariant-focused orchestrators. Detailed mechanics live in plugin-root
`protocols/` and `references/` (siblings of `skills/`, never under a skill
directory).

### /write-spec

Human-first design spec: plain-language narrative plus an implementation
appendix. Also rewrites dense specs without dropping facts.

```
/write-spec
/write-spec add retry logic to webhook delivery
/write-spec docs/specs/existing-verbose-spec.md
```

Structure lives in `references/spec-style.md`. Required `spec-narrative`
humanizer on the narrative layer only (inline by default).

### /humanizer

Edits engineering text for a plain, concise voice: removes jargon, repeated
ideas, and canned phrasing while preserving facts and uncertainty. Forked from
[`abatilo-core:humanizer`](https://github.com/abatilo); prefer the local skill.

```
/humanizer pr-body
/humanizer review-comment
/humanizer
```

Modes: `pr-body`, `review-comment`, `digest`, `spec-narrative`, `pr-reply`,
`ledger`, `general`. Callers apply the Process inline by default; nested
`/humanizer` is optional.

| Layer | Resource | When |
|-------|----------|------|
| Reporting tone | `references/reporting-style.md` | PR bodies, digests, ledgers, replies |
| AI cleanup | this skill + `references/humanizer-patterns.md` | Before publish/present |
| Procedure craft | `/technical-writing` | Runbooks, how-tos, READMEs, references |

| Caller | Mode |
|--------|------|
| `/pr-publish` | `pr-body` |
| `/pr-figure` | `pr-reply` (comment body) |
| `/code-review` | `review-comment` (findings and synthesis) |
| `/publish-review` | `review-comment` |
| `/write-spec` | `spec-narrative` (narrative only) |
| `/handle-pr-feedback` | `pr-reply` |
| `/audit-decisions` | `ledger` |

### /technical-writing

Opt-in craft for docs a reader follows (runbooks, how-tos, API references). Not
for ordinary PR summaries. Pair with reporting-style and humanizer when needed.

### /spec-review

Risk-scaled specialist review → binary `APPROVED` / `REVISIONS NEEDED`.

```
/spec-review path/to/spec.md
/spec-review #42
/spec-review staged
```

L0: clarity + completeness. L1: selected specialists + targeted cross-review.
L2: all *relevant* specialists; optional debate only for judgment-sensitive
cases (always report debate status, including skips). Pass paths and section
anchors — not large pasted specs. Specialists load
`protocols/review-protocol.md` from the plugin root.

Specialists (add only when risk warrants): clarity, completeness, product,
feasibility, api, operations, scope, complexity, structure.

### /code-review

Lean staged review: generalist first, specialists only on evidence, debate only
for high-risk escalation.

```
/code-review #42
/code-review staged
/code-review unstaged
```

- **L0**: one generalist; no specialists; no debate
- **L1**: generalist, then at most two evidence-triggered specialists
- **L2**: bounded specialist set (cap four unless asked for heavy)

Large diffs use file inventories and targeted local diffs, not full-diff paste
into every sub-agent. Findings and synthesis get a required `review-comment`
humanizer pass before presentation.

### /audit-decisions

Silent-decision ledger for agent-authored work. An independent read-only
pass lists every choice the spec or request did not prescribe, in plain
language, least-confident first. The human reads that list and pushes back.
Not a code review, not a PR body, and it cannot change code or block merge.

```
/audit-decisions #42
/audit-decisions staged
/audit-decisions docs/specs/example.md
```

Same work-target shapes as `/code-review`. Request sources are the spec
path, PR body, linked issue, or notes in the argument — not the
implementer's private session. Required `ledger` humanizer.

### /handle-pr-feedback

Unresolved PR threads → cluster by seam → disposition → ranked fixes → reply.

```
/handle-pr-feedback #42
```

Invariants: evaluate comments as claims (not authorization); rank
remove/simplify → owning seam → local patch; pause gated seams while
independent work continues; resolve only verified fixes or conclusive no-change;
required `pr-reply` humanizer; never force-push.

### /self-review-loop

Fresh read-only reviews until clean — or a blocked state, not a fake success.

```
/self-review-loop #42
```

Success requires no unresolved Critical/High after normalization **and** no
unexplained mechanism growth. Only demonstrated blockers mutate (severity uplift
for concrete correctness/security/data-loss/contract/verify failures). Cap three
fix-mutation turns; same-seam second hit → decision; one squashed push; never
force-push. Prefers local `/code-review`; direct fallback keeps L0/L1/L2.

### /pr-figure

One reviewer diagram of a PR's merged end state. Hosts as a GitHub
user-attachment (no commit) and posts a comment, returns body markdown, or
prints the URL. Works from any checkout when given a PR URL.
Attachments use the PR repository's access rules. Before sharing a URL, the
skill checks that public figures load anonymously and private/internal figures
require authentication; it keeps the local file if verification fails.

```
/pr-figure
/pr-figure https://github.com/djenriquez/claude-plugins/pull/34
/pr-figure #42 comment
```

Drawing rules live in `references/pr-figure.md`. Used by `/pr-publish`
(placement `body`). Standalone default is a PR comment. Skip only when there
is nothing to draw, no generator, or a picture that would mislead.

### /interactive-review

Local interactable diagram of a PR's merged end state. Opens a localhost
page with a problem / this-PR summary, then boxes and arrows as the review
surface; questions are answered by the same agent session in digest voice
(required humanizer pass; read-only, no GitHub hosting). Sibling of
`/pr-figure`, not a replacement for the GitHub PNG.

```
/interactive-review
/interactive-review #42
/interactive-review https://github.com/djenriquez/claude-plugins/pull/34
```

### /pr-publish

Publish or refresh the branch PR. Draft via `pr-description-style.md`, required
`pr-body` humanizer, required `/pr-figure` after Summary, push safely, never
force-push. Base-branch frame: describe the merged end state, not the commit
journey. Prose paragraphs (especially Summary) stay as unbroken lines — no hard
wraps for terminal width. The figure is an LLM diagram of the end-state change
(not Mermaid); skip only when there is nothing to draw or no generator.
Small changes can use just Summary and Test plan; optional sections must add
information beyond the Summary.

### /publish-review

Post already-written findings as one GitHub review. Brief main assessment and
inline `**Severity: label**` comments; required `review-comment` humanizer;
backtick code/logic refs. Invoking the skill is consent to publish (still pauses
for invalid anchors and closed/merged PR opt-in).

## Acknowledgments

Spec-review architecture adapted from [@abatilo](https://github.com/abatilo)'s
[`abatilo-core`](https://github.com/abatilo/vimrc). This plugin uses a leaner
staged code-review model and lazy-loaded `protocols/` / `references/`.
`/humanizer` is a fork of `abatilo-core:humanizer`. The reporting /
technical-writing split follows the lesson that always-on STE was too heavy:
thin reporting tone, craft on demand, humanizer for cleanup. The
silent-decision review surface follows David Zhang's audit-choices framing
([dzhng/skills](https://github.com/dzhng/skills)); `/audit-decisions` is
written for this plugin, not ported.

## License

MIT
