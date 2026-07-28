# djenriquez agent plugins

Agent workflow plugins by [@djenriquez](https://github.com/djenriquez), packaged for Claude Code and Codex.

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

### /full-dev-flow

Runs the complete development workflow from the current session context to a reviewed pull request. This is the high-level orchestrator for the recurring "spec, plan, implement, publish, review" loop.

```
/full-dev-flow
/full-dev-flow build the workflow we discussed
```

The skill:

1. Writes a standalone spec from the conversation context via `/write-spec`
2. Runs `/spec-review` and revises the spec, using judgment to skip nits or irrelevant findings
3. Runs `/bits-plan` against the final spec
4. Runs `/bits-drain` until the implementation queue is complete
5. Commits remaining work and runs `/pr-publish`
6. Chooses whether the PR should target the default branch or stack on an existing PR branch
7. Runs `/self-review-loop` against the published PR
8. Posts `/assisted-review-heavy` on the PR after self-review succeeds

It also persists a workflow checklist before long-running phases so an interrupted agent can resume without losing the intended order.

### /write-spec

Authors a human-first design spec: a plain-language narrative a reviewer can absorb in minutes, backed by a collapsed implementation appendix holding the exhaustive `file:line` detail implementing agents need. Can also rewrite an existing spec that is too dense for human review — nothing is deleted, only demoted.

```
/write-spec
/write-spec add retry logic to webhook delivery
/write-spec docs/specs/existing-verbose-spec.md   # rewrite for readability
```

The spec structure and writing rules live in `references/spec-style.md`: conclusion-first sections, word budgets for the narrative layer, Mermaid diagrams for multi-actor flows, key-decisions tables, and a final skim-test checklist. `full-dev-flow` and `issue-to-spec` delegate their spec-writing steps to this skill. Narrative prose runs through the local `/humanizer` skill before presentation.

### /humanizer

Rewrites agent-drafted text so a busy human can skim it without AI jargon or bloated terminology. Forked from [`abatilo-core:humanizer`](https://github.com/abatilo) (Wikipedia "Signs of AI writing"), adapted for engineering artifacts, and paired with a thin reporting register learned from abatilo's later STE split.

```
/humanizer pr-body
/humanizer review-comment
/humanizer
```

Modes: `pr-body`, `review-comment`, `digest`, `spec-narrative`, `pr-reply`, and `general`. The pass is surgical — it fixes contaminated sections only, prefers fewer ideas over telegraphic fragments, and preserves technical claims and normative force.

Writing layers (load by need):

| Layer | Resource | When |
|-------|----------|------|
| Reporting tone | `references/reporting-style.md` | PR bodies, digests, replies, other reported work |
| AI cleanup | `/humanizer` | Required before publish/present of human-facing text |
| Procedure craft | `/technical-writing` | Opt-in for runbooks, how-tos, READMEs, reference pages |

Required humanizer modes:

| Skill | Mode |
|-------|------|
| `/pr-publish` | `pr-body` |
| `/publish-review` | `review-comment` |
| `/pr-digest` | `digest` |
| `/write-spec` | `spec-narrative` (narrative layer only) |
| `/handle-pr-feedback` | `pr-reply` |

### /technical-writing

Sentence-level craft for documents a reader follows or looks facts up in (runbooks, procedures, API references, migration guides, long how-tos). Loads only when authoring those docs — not for ordinary PR summaries. Uses condition-before-command, one name per thing, and plain-language warnings on destructive steps. Pair with reporting-style and a humanizer cleanup pass when needed.

### /spec-review

Risk-scaled spec review that catches ambiguity, missing edge cases, architectural infeasibility, API design gaps, operational blindspots, and scope risks before implementation starts.

```
/spec-review path/to/spec.md
/spec-review #42                   # GitHub issue or PR (auto-detected)
/spec-review https://docs.google.com/...
/spec-review staged
/spec-review                       # uses conversation context
```

The skill selects only the specialist reviewers needed for the spec:

| Specialist | Focus |
|------------|-------|
| clarity-reviewer | Ambiguity, contradictions, undefined terms, testable acceptance criteria |
| completeness-reviewer | Missing edge cases, error behavior, NFRs, state transitions |
| product-reviewer | Goal alignment, user value, success criteria, scope-to-value ratio |
| feasibility-reviewer | Technical feasibility, architectural fit, hidden complexity |
| api-reviewer | API surface, backward compat, protobuf conventions, idempotency |
| operations-reviewer | Failure modes, observability, rollback, SLO impact, on-call burden |
| scope-reviewer | Incremental delivery, dependency risks, timeline, scope creep |
| complexity-reviewer | Premature abstractions, over-engineering, speculative generality, accidental complexity |
| structure-reviewer | Package/module boundaries, cohesion, public surface, layering |

Review rigor scales with risk:

- **L0 (Minor)**: typo fixes, small clarifications — clarity + completeness only
- **L1 (Significant)**: new features, API additions — selected specialists, self-critique, targeted cross-review
- **L2 (Strategic)**: architecture changes, new services — all relevant specialists, optional external debate only when high-impact judgment needs stress-testing

Large specs are referenced by path and targeted excerpts rather than pasted into every reviewer prompt. Output is a deduplicated review with a binary verdict (APPROVED / REVISIONS NEEDED).

### /interview

Lean planning interview for turning an issue, rough plan, or implementation idea into spec-ready decisions.

```
/interview
/interview probe this implementation plan
```

The skill asks a small number of high-signal question rounds, probes assumptions and failure modes, then returns decisions, accepted assumptions, open risks, and acceptance-criteria seeds. `issue-to-spec` uses this local interview path by default.

### /code-review

Lean, risk-scaled code review. It starts with one generalist pass, then adds specialists only when the diff shows concrete risk.

```
/code-review #42
/code-review staged
/code-review unstaged
/code-review feature/my-branch
```

Review shape:

- **L0 (Routine)**: one concise generalist review, no specialist fan-out, no debate
- **L1 (Significant)**: generalist first, then at most two evidence-triggered specialists such as security, performance, testing, architecture, or maintainability
- **L2 (High-risk)**: bounded specialist set, capped at four unless the user asks for a heavy review

External debate is optional and used only to falsify uncertain high-severity findings, resolve specialist disagreement, or stress-test an L2 verdict. Large diffs use changed-file inventories and targeted local diffs instead of duplicating the full diff into every sub-agent prompt.

### /issue-to-spec

Orchestrates the full investigation-to-spec workflow starting from a GitHub issue — explores the issue and codebase, interviews the user, authors a spec via `/write-spec`, assesses complexity, and conditionally launches `/spec-review` to harden it.

```
/issue-to-spec #42
/issue-to-spec 42
```

### /handle-pr-feedback

Reads unresolved review comments on a GitHub PR, triages each one, makes code changes, pushes a commit, replies to every comment with the action taken, and resolves each thread.

```
/handle-pr-feedback #42
/handle-pr-feedback 42
```

1. Checks out the PR branch and fetches unresolved review threads via the GitHub GraphQL API
2. For each thread, analyzes the comment and decides whether to **address** (make a code change) or **skip** (with explanation)
3. Commits and pushes all changes in a single commit
4. Replies to each comment thread with the action taken or reason for skipping
5. Resolves every thread

### /self-review-loop

Iterative self-improvement loop for PRs. Launches a fresh, context-free sub-agent each turn to review the PR, then evaluates and applies the feedback. It succeeds only when no unresolved Critical or High findings remain; turn limits and oscillation detection are blocked states, not successful exits.

```
/self-review-loop #42
/self-review-loop 42
```

1. Prefers the local lean `/code-review` skill when available
2. Uses fresh, context-free, read-only review against the local PR diff
3. Parses the review output and triages each finding (address or skip)
4. Runs tests/linters to verify changes, then commits and pushes only after a successful no-unresolved-Critical/High review state
5. Uses file inventories and targeted local diffs for large PRs
6. Runs optional external debate only for high-risk escalation, disputed blockers, or judgment-sensitive final states
7. Reports the review path, changes, skipped findings, verification evidence, and push status

The loop does not rely on imported nested review-team workflows by default. If the local lean `/code-review` skill cannot be invoked, the direct fallback follows the same staged L0/L1/L2 policy.

### /pr-publish

Publishes finished branch work as a GitHub pull request (or refreshes the current branch's PR). Drafts a layered description, runs a required `/humanizer` pass in `pr-body` mode so the Summary is skimmable by humans, then pushes and creates or updates the PR. Never force-pushes.

### /publish-review

Publishes already-written code-review findings as one GitHub PR review with inline comments. Validates diff anchors, rewrites each finding through `/humanizer` in `review-comment` mode, previews for confirmation, then submits a single grouped review.

### /pr-digest

Loads full PR context (diff, description, linked issues, commits, review threads, CI) and produces a structured narrative summary. Runs a required `/humanizer` pass in `digest` mode before presenting.

## Acknowledgments

The original spec-review architecture was adapted from [@abatilo](https://github.com/abatilo)'s [`abatilo-core` code-review skill](https://github.com/abatilo/vimrc). This plugin now uses a leaner staged review model for code review and lazy-loaded references for detailed workflow mechanics. The `/humanizer` skill is a fork of [`abatilo-core:humanizer`](https://github.com/abatilo), extended with engineering modes and wired into human-facing skills. The reporting / technical-writing split follows abatilo's later lesson that always-on Simplified Technical English was too heavy: thin reporting tone for everyday reported work, craft on demand for procedures, and humanizer for AI cleanup.

## License

MIT
