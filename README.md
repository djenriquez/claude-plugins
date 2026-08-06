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

### /full-dev-flow

Session context → Ready spec → harness-native plan/drain → PR → self-review →
`/assisted-review-heavy`.

```
/full-dev-flow
/full-dev-flow build the workflow we discussed
```

Order: choose branch strategy (update current PR, stack, or branch from default)
→ `/write-spec` → `/spec-review` → harness-native task plan (no bits unless
asked) → drain → commit → `/pr-publish` → `/self-review-loop` → post heavy
review only after self-review succeeds. Persists a `[workflow]` checklist so
interrupted runs can resume. Wrong PR base or open product tasks stop the flow.

### /write-spec

Human-first design spec: plain-language narrative plus an implementation
appendix. Also rewrites dense specs without dropping facts.

```
/write-spec
/write-spec add retry logic to webhook delivery
/write-spec docs/specs/existing-verbose-spec.md
```

Structure lives in `references/spec-style.md`. Required `spec-narrative`
humanizer on the narrative layer only (inline by default). Used by
`/full-dev-flow` and `/issue-to-spec`.

### /humanizer

Surgical AI-slop cleanup for engineering text. Forked from
[`abatilo-core:humanizer`](https://github.com/abatilo); prefer the local skill.

```
/humanizer pr-body
/humanizer review-comment
/humanizer
```

Modes: `pr-body`, `review-comment`, `digest`, `spec-narrative`, `pr-reply`,
`general`. Callers apply the Process inline by default; nested `/humanizer` is
optional.

| Layer | Resource | When |
|-------|----------|------|
| Reporting tone | `references/reporting-style.md` | PR bodies, digests, replies |
| AI cleanup | this skill + `references/humanizer-patterns.md` | Before publish/present |
| Procedure craft | `/technical-writing` | Runbooks, how-tos, READMEs, references |

| Caller | Mode |
|--------|------|
| `/pr-publish` | `pr-body` |
| `/publish-review` | `review-comment` |
| `/pr-digest` | `digest` |
| `/write-spec` | `spec-narrative` (narrative only) |
| `/handle-pr-feedback` | `pr-reply` |

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

### /interview

High-signal planning interview → decisions, assumptions, risks, acceptance
seeds. Default interview path for `/issue-to-spec`.

```
/interview
/interview probe this implementation plan
```

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
into every sub-agent.

### /issue-to-spec

Issue → explore → interview → `/write-spec` → complexity gate → conditional
`/spec-review` → Ready spec.

```
/issue-to-spec #42
```

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

### /pr-publish

Publish or refresh the branch PR. Draft via `pr-description-style.md`, required
`pr-body` humanizer, push safely, never force-push. Base-branch frame: describe
the merged end state, not the commit journey.

### /publish-review

Post already-written findings as one GitHub review. Qualitative main body +
inline `**Severity: label**` comments; required `review-comment` humanizer;
backtick code/logic refs. Invoking the skill is consent to publish (still pauses
for invalid anchors and closed/merged PR opt-in).

### /pr-digest

Comprehension digest of a PR (not critique). Loads metadata, diff, issues,
threads, CI, and key files; summarizes by logical concern; required `digest`
humanizer; then Q&A on the loaded context.

## Acknowledgments

Spec-review architecture adapted from [@abatilo](https://github.com/abatilo)'s
[`abatilo-core`](https://github.com/abatilo/vimrc). This plugin uses a leaner
staged code-review model and lazy-loaded `protocols/` / `references/`.
`/humanizer` is a fork of `abatilo-core:humanizer`. The reporting /
technical-writing split follows the lesson that always-on STE was too heavy:
thin reporting tone, craft on demand, humanizer for cleanup.

## License

MIT
