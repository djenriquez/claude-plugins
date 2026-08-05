---
name: spec-review
description: "Reviews a spec with risk-scaled specialist agents, deduplicates findings, and returns a binary APPROVED / REVISIONS NEEDED verdict."
argument-hint: "[file path, #N (GitHub issue/PR), URL, 'staged', or omit for conversation context]"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Glob
  - Grep
  - Task
  - TeamCreate
  - TeamDelete
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
  - SendMessage
  - WebSearch
  - WebFetch
  - ToolSearch
mcpServers:
  - codex
---

# Spec Review

Review the target spec in `$ARGUMENTS`. If no target is provided and the conversation does not contain the spec, ask what to review.

## Plugin paths (read first)

Resolve shared files from the installed `djenriquez-core` **plugin root** — the
directory that contains `.claude-plugin/`, `skills/`, `references/`,
`protocols/`, and `agents/` as siblings. Unqualified `references/...`,
`protocols/...`, and `agents/...` mean that root. They do **not** resolve under
`skills/spec-review/`.

Before spawning reviewers, load:

- `<plugin-root>/references/harness-adapters.md` — Claude Code / Cursor / Codex
  spawn and cross-review mapping
- `<plugin-root>/protocols/review-protocol.md` — taxonomy, qualification,
  self-critique, cross-review, output mechanics (single source)

## Goals

- Find spec gaps that would cause implementation rework, divergent behavior, unsafe rollout, or unclear ownership.
- Scale review depth to risk.
- Avoid repeated prompt bloat: pass file paths and focused context whenever agents can read the repository themselves.
- Produce a concise final review with a binary verdict.

## Gather The Spec

Resolve `$ARGUMENTS`:

- `#N`: resolve with `gh issue view <N> 2>/dev/null || gh pr view <N>`; include relevant comments, linked PRs, or linked issues.
- file path: read the file and keep the path available for agents.
- URL: fetch the content.
- `staged`: inspect staged spec-like files.
- no argument: use conversation context if it contains the spec.

Also gather nearby codebase context only when it helps reviewers evaluate feasibility, APIs, operations, package structure, or existing terminology.

## Classify Risk

- `L0`: typo, small clarification, or narrow addendum.
- `L1`: new feature, API/workflow change, multiple sections, or meaningful implementation choices.
- `L2`: architecture, new service/module, public API, data model, security, production reliability, or cross-team impact.

## Select Reviewers

Use the fewest specialists that cover the risk:

- Always consider `clarity-reviewer` and `completeness-reviewer`.
- Add `product-reviewer` for goal/value/success-criteria risk.
- Add `feasibility-reviewer` for architecture or hidden implementation risk.
- Add `api-reviewer` for public or cross-team API changes.
- Add `operations-reviewer` for production rollout, observability, rollback, or SLO risk.
- Add `scope-reviewer` for multi-phase, multi-team, or delivery-risk specs.
- Add `complexity-reviewer` for abstraction, configurability, or over-engineering risk.
- Add `structure-reviewer` for new packages/modules or package boundary changes.

For `L0`, use only clarity and completeness unless the spec obviously touches another domain. For `L2`, include all **relevant** specialists, not every specialist by default. Prefer a tight set over a token-heavy fan-out.

## Run Reviewers

### Lead checklist (required before spawn)

Each reviewer prompt **must** include:

1. Risk lane (`L0` / `L1` / `L2`) and that self-critique is required for L1/L2
2. Absolute repository path and absolute (or repo-relative) spec path
3. Important section anchors (not the full large spec body)
4. Instruction to load `<plugin-root>/protocols/review-protocol.md` and the
   matching `<plugin-root>/agents/<reviewer>.md` if the harness does not inject
   that agent definition automatically
5. Instruction to return Phase 1 findings as the **final response body** (all
   harnesses). Claude Code team tools (`SendMessage`, etc.) are optional extras
   only when available — see harness adapters

Do **not** rely on the lead pasting the full protocol text. Specialists load it.
Still pass risk lane + paths; forgetting those is a lead error.

### Prompt size

Do not paste a large spec or large related diff into every specialist prompt.
For large targets: repository path, spec path, important sections, and
instructions to read targeted files. Prefer path + section list over inlining.

### Spawn

Spawn selected reviewers in parallel when the harness supports it (see
`harness-adapters.md` for Claude Code teams, Cursor `Task` + `*-reviewer`
types, and Codex `spawn_agent`). If a reviewer fails, re-run that reviewer once
with the same scoped context. If it fails again, record the failure and continue
only if the missing specialist is not required for the risk lane.

## Cross-Review

Skip cross-review for `L0`.

For `L1` and `L2`, route only meaningful disputes:

- contradictory findings
- high-severity findings that need a second domain view
- findings whose ownership clearly belongs to another specialist

Limit each disputed finding to one challenge round. The lead arbitrates unresolved disagreement.

Harness mapping:

- **Claude Code teams**: lead uses `SendMessage`; specialists wait for challenges.
- **Cursor / one-shot Task**: lead collects Phase 1 returns, then spawns a
  follow-up Task (same reviewer type, `resume` when available) with only the
  disputed finding(s). Do not expect specialists to idle after the first return.
- **Codex**: lead uses follow-up input / second spawn per harness adapters.

## Optional External Debate

Do not run debate by default. Load `<plugin-root>/protocols/mcp-debate.md` only when one of these is true:

- the spec is `L2` and the final verdict depends on high-impact judgment
- reviewers disagree on a Critical finding
- the lead suspects a high-severity false positive or missed blocker

**Debate status is mandatory in the synthesis summary.** If no debate-capable MCP
exists, the user declines the checkpoint, or the trigger conditions are not met,
skip debate and state explicitly which case applied (for example
`Debate: skipped — no debate-capable MCP in this session`). Never omit the line.

## Synthesize

Deduplicate reviewer output and map findings:

- Critical: blockers that must be resolved before implementation
- High: important risks or P0/P1 non-blockers
- Medium: P2 concerns
- Low: P3, nitpicks, or thoughts

Omit empty tiers. Do not include unresolved contradictory feedback.

Include a short coverage line: risk lane, specialists run, specialists skipped
(with reason), reviewer failures, and debate status.

End with the last section exactly as one of:

```markdown
## Verdict: APPROVED
This spec is ready for implementation. <brief rationale>
```

```markdown
## Verdict: REVISIONS NEEDED
This spec has <N> critical item(s) that must be resolved before implementation:
1. **<title>** - <section> - <what must change and why>
```

## Calibration

- The spec is not the implementation; require constraints, not every implementation detail.
- Prefer a few high-signal findings over a long mixed list.
- Approve when the spec is clear enough to build from without significant rework.
- Frame opinions as tradeoffs unless there is concrete harm.
- Treat a decision the spec explicitly delegates to implementation time with stated bounds as resolved design, not a completeness gap; review whether the bounds are adequate, not whether the mechanism is chosen.
