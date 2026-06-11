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

Use `references/harness-adapters.md` when translating team, task, or sub-agent operations across Claude Code and Codex. Use `protocols/review-protocol.md` as the single source for reviewer taxonomy, qualification, self-critique, cross-review, and output mechanics.

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

For `L0`, use only clarity and completeness unless the spec obviously touches another domain. For `L2`, include all relevant specialists, not every specialist by default.

## Run Reviewers

Load `protocols/review-protocol.md` once before spawning reviewers.

Each reviewer prompt should contain:

- the selected reviewer's `agents/<reviewer>.md` instructions if the harness does not register that agent directly
- the shared review protocol
- risk lane and self-critique requirement
- concise spec context and related codebase context
- either the full spec text when small, or the spec path plus targeted excerpts when large

Do not paste a large spec or large related diff into every specialist prompt. For large targets, give the repository path, spec path, important sections, and instructions to read targeted files directly.

Spawn selected reviewers in parallel when the harness supports it. If a reviewer fails, re-run that reviewer once with the same scoped context. If it fails again, record the failure and continue only if the missing specialist is not required for the risk lane.

## Cross-Review

Skip cross-review for `L0`.

For `L1` and `L2`, route only meaningful disputes:

- contradictory findings
- high-severity findings that need a second domain view
- findings whose ownership clearly belongs to another specialist

Limit each disputed finding to one challenge round. The lead arbitrates unresolved disagreement.

## Optional External Debate

Do not run debate by default. Load `protocols/mcp-debate.md` only when one of these is true:

- the spec is `L2` and the final verdict depends on high-impact judgment
- reviewers disagree on a Critical finding
- the lead suspects a high-severity false positive or missed blocker

If no debate-capable MCP exists or the user declines the debate checkpoint, skip debate and state that in the summary.

## Synthesize

Deduplicate reviewer output and map findings:

- Critical: blockers that must be resolved before implementation
- High: important risks or P0/P1 non-blockers
- Medium: P2 concerns
- Low: P3, nitpicks, or thoughts

Omit empty tiers. Do not include unresolved contradictory feedback.

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
