---
name: self-review-loop
description: "Iteratively reviews a PR with fresh read-only reviewers, applies only ranked design-quality fixes for demonstrated blockers, pauses same-seam or mechanism-expanding work for decisions, and pushes one final squashed commit only after a clean review without unexplained complexity growth."
argument-hint: "#N or N (PR number)"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Bash(npm:*)
  - Bash(npx:*)
  - Bash(make:*)
  - Bash(pytest:*)
  - Bash(go:*)
  - Bash(cargo:*)
  - Bash(bundle:*)
  - Bash(dotnet:*)
  - Bash(mvn:*)
  - Bash(gradle:*)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - Skill
  - AskUserQuestion
  - ToolSearch
mcpServers:
  - claude
  - codex
---

# Self-Review Loop

Target: `$ARGUMENTS`. Ask if missing.

Load `references/github-pr-workflow.md` for PR/checkout/diff rules.
Load `protocols/feedback-disposition.md` before triage or mutation (fixtures when
ambiguous). Load `references/harness-adapters.md` only for cross-harness spawn.
Prefer lean `djenriquez-core:code-review`; direct fallback must follow the same
L0/L1/L2 policy. Optimize for a simpler correct design, not clearing findings
with sediment.

## Invariants

- Fresh, context-free, read-only reviewers on local
  `origin/<baseRefName>...HEAD` (plus full self-review delta after fixes).
- Success requires both: no unresolved Critical/High after severity
  normalization, and no unexplained mechanism growth from this run.
- Only demonstrated blockers drive edits. After evidence validation, concrete
  correctness, security, data-loss, broken-contract, or failing-verification
  issues are blocking regardless of Medium/Low label. Remaining Medium/Low and
  Observations do not create fix turns.
- Rank remedies before mutation: remove/simplify → owning seam → local patch.
- `NEEDS DECISION` and same-seam second blockers pause that seam (and shared
  remedy/files). Independent `FIX NOW` on other seams may continue.
- Approach checkpoint over the self-review delta before the 2nd+ fix-mutation
  turn. Cap fix-mutation turns at 3 without explicit continue (hard cap 10
  review turns). Max turns, oscillation, same-seam escalation without a
  decision, unexplained mechanism growth, and final-review failure are blocked
  states — not success.
- Per-turn commits stay local. Publish one squashed self-review commit only.
  Never force-push. Debate-driven code changes need a final fresh review before
  push.

## Setup

Checkout the open PR. Record `review_base_sha`, `pr_base_sha`, refs,
changed-file inventory, empty `fixed_seams`, `fix_mutation_turns=0`, and the
detected verification command (or `no test suite detected`).

## Loop

Each turn:

1. **Review** — Fresh reviewer/skill; inventory + targeted
   `git diff origin/<base>...HEAD -- <path>`; after prior fixes also
   `git diff "$review_base_sha"...HEAD`. Findings by severity + separate
   Observations.
2. **Triage** — Revalidate blockers via `code-review-protocol.md` and
   `feedback-disposition.md`. Cluster by root cause/seam → `FIX NOW` /
   `NO CHANGE` / `NEEDS DECISION`. Same-seam after a prior fix →
   `NEEDS DECISION`. Present decision packets for gated clusters; pause those
   seams.
3. **Checkpoint** — Before 2nd+ mutation: would reshape/revert beat another
   patch? If yes, stop gated. If already 3 fix turns, ask before more.
4. **Mutate** — Independent `FIX NOW` only, ranked remedies. Optional Go/
   structure refs when those surfaces change. Verify; fix turn-caused failures
   without evading seam/complexity rules.
5. **Account** — Report growth/mechanisms for turn, self-review run, and total
   PR. Gated mechanism growth → `NEEDS DECISION` before commit. Soft size →
   report and ask. Local commit; update `fixed_seams` and
   `fix_mutation_turns`.

Retry a failed review path once; then fall back to direct fresh review; two
direct failures → blocked. After turn 2, stop on oscillation (undoing prior
fixes or growing mechanisms on the same seams).

## Optional debate

After a clean main loop, consider `protocols/mcp-debate.md` only for high-risk/
security PRs, disputed skipped blockers, or judgment-sensitive merge calls. Ask
run/skip first. Disposition any debate finding before code changes; if code
changes, one more fresh review before push.

## Squash and push

Push only on clean review (and clean post-debate final if required), no
unexplained mechanism growth, clean tree, and `review_base_sha..HEAD` containing
only this run's commits. Soft-reset squash → one commit → pull --rebase →
re-verify if needed → normal push. Never `--force` / `--force-with-lease`.

## Summary

PR identity, stop reason, turns, review path, dispositions/seams/remedies,
checkpoint outcome when relevant, verification, growth/mechanisms, debate
status, push or blocked reason.
