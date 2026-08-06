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

Review `$ARGUMENTS`. Ask if missing and conversation has no spec.

Plugin root = directory with `.claude-plugin/`, `skills/`, `references/`,
`protocols/`, `agents/` as siblings. Unqualified `references/` / `protocols/` /
`agents/` mean that root — not `skills/spec-review/`.

Before spawn, load `references/harness-adapters.md` and
`protocols/review-protocol.md` (single source for taxonomy, qualification,
cross-review, output).

## Invariants

- Scale depth to risk; fewest specialists that cover it.
- Pass paths + section anchors — not large pasted specs/diffs.
- Specialists load `review-protocol.md` and their `agents/<name>.md`.
- Binary verdict last: `APPROVED` or `REVISIONS NEEDED`.
- Always report debate status (including explicit skip reason).
- Spec is not implementation: require constraints, not every detail. Prefer
  few high-signal findings. Explicitly bounded deferrals are not completeness
  gaps.

## Flow

1. **Gather** — File path, `#N` (issue/PR), URL, `staged`, or conversation.
   Nearby codebase context only when it aids feasibility/API/ops/structure.
2. **Risk** — `L0` narrow clarification; `L1` feature/API/meaningful choices;
   `L2` architecture, new module/service, public API, data model, security,
   production reliability, cross-team.
3. **Select** — Always consider clarity + completeness. Add product,
   feasibility, api, operations, scope, complexity, structure only when the
   risk warrants. `L0`: clarity+completeness unless another domain is obvious.
   `L2`: all *relevant* specialists, not every specialist.
4. **Spawn** — Each prompt: risk lane, repo + spec paths, section anchors,
   load protocol + agent file, return Phase 1 findings as final body. Parallel
   when supported. Retry a failed reviewer once; continue only if that
   specialist is not required for the lane.
5. **Cross-review** — Skip `L0`. For `L1`/`L2`, one challenge round on
   contradictions, high-severity needs second view, or clear ownership
   mismatches. Lead arbitrates. Harness follow-up patterns live in
   `harness-adapters.md`.
6. **Debate** — Load `protocols/mcp-debate.md` only for judgment-sensitive `L2`,
   Critical disagreement, or suspected high-severity miss/FP. Otherwise skip
   and state why.
7. **Synthesize** — Dedup into Critical/High/Medium/Low (omit empty). Coverage
   line: lane, run/skipped specialists, failures, debate status. End with
   exactly one verdict block.
