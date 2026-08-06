---
name: full-dev-flow
description: "Runs the complete development workflow from session context to reviewed pull request: write a spec, run spec-review and revise the spec, create an implementation task plan with the harness-native task system, drain that queue, commit, publish a PR, run self-review-loop, and post /assisted-review-heavy. Use when the user asks for the full dev flow, spec-to-PR workflow, plan/build/publish workflow, or wants an agent to carry a discussed feature through spec, implementation, PR publication, and automated review."
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Bash(jq:*)
  - Bash(mkdir:*)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Skill
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
  - TodoWrite
  - ToolSearch
---

# Full Dev Flow

Orchestrate session context into a finished PR, then request heavy assisted
review. Target: `$ARGUMENTS`. Use the conversation as primary context; ask only
when a concrete, testable spec cannot be written.

Invoke sub-skills via the host (Claude slash commands, Codex
`djenriquez-core:*`, Cursor: read `SKILL.md`). Do not reimplement them. Load
`<plugin-root>/references/harness-adapters.md` for task/plan and spawn mapping.
Use the harness-native task/plan system only — no bits or external planner
unless the user asks.

## Invariants

- Never discard or overwrite user work. Ask about unrelated dirty tracked files.
- Spec must stand alone with observable acceptance criteria before planning.
- Critical/blocking unresolved after review → stop or ask. Cap spec-review at 3
  passes.
- Implementation queue must drain (or cancel with reason) before commit/publish.
- Wrong PR base → stop before self-review.
- Self-review must succeed before `/assisted-review-heavy`.
- Stage only workflow-produced files; never `git add -A` with unrelated
  untracked paths.

## Phases

Keep a durable `[workflow]` checklist (harness-native tasks) with
`spec_path`, `branch_strategy`, `expected_pr_base`, `pr_number`/`pr_url`, and
last completed phase. On resume, continue from the first incomplete phase.

1. **Preflight / branch** — Discover status, default branch, and current PR.
   Choose: update current PR, stack on current PR head, or branch from default.
   Record strategy and `expected_pr_base`. For stacks, create the child from the
   parent head and set `gh-merge-base`.
2. **Write spec** — Invoke `write-spec` (fallback: `references/spec-style.md`).
   No unresolved blockers that prevent implementation.
3. **Spec-review** — Invoke `spec-review`. Address Critical/High unless false
   positive, contradicts the goal, or expands scope (record skips). Revise the
   spec, not a review transcript. Set `**Status**: Ready` when done.
4. **Plan** — Harness-native implementation queue from the ready spec: root
   verify-done, self-contained implement tasks pointing at `spec_path`,
   verification after the work it covers, docs task when guidance files need
   updates. Prefer fewer larger tasks.
5. **Drain** — Implement → evidence → verify until product work is done. Stop
   and report blockers; do not publish while product tasks remain open.
   Orchestration checklist items are not product blockers.
6. **Commit** — Commit remaining work (prefer host commit skill). Stop if
   nothing changed since the chosen base.
7. **Publish** — Re-check `expected_pr_base`, invoke `pr-publish`, correct base
   if needed. Stop on uncorrectable mismatch.
8. **Self-review** — Invoke `self-review-loop` on the published PR. Stop if
   blocked.
9. **Heavy review** — `gh pr comment <N> --body "/assisted-review-heavy"` only
   after self-review success.

## Final summary

Report: spec path and review verdict; plan/drain result; branch strategy and PR
base/URL; commits; self-review result; whether heavy review was posted; material
skips. On early stop: phase, blocker, safest resume command.
