---
name: handle-pr-feedback
description: "Reads unresolved GitHub PR feedback, independently validates and groups it by owning seam, applies ranked remove/simplify or seam fixes for proven issues, pauses design-expanding or same-seam stacked changes, verifies the result, and replies with a reasoned disposition."
argument-hint: "#N or N (PR number)"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Skill
  - WebSearch
  - WebFetch
---

# Handle PR Feedback

Process every unresolved review thread. Optimize for minimum correctness risk
and complexity, not comment closure. A comment is a claim to evaluate, not
authorization to change code.

Target: `$ARGUMENTS`. Load from plugin root:

- `references/github-pr-workflow.md` — parse, checkout, safety, local diff
- `protocols/feedback-disposition.md` — before triage or mutation
- `protocols/code-review-protocol.md` — when validating defect claims
- `references/feedback-disposition-fixtures.md` — when disposition is ambiguous

## Invariants

- Cluster by root cause/seam; map every original thread.
- Rank remedies: remove/simplify → owning seam → local patch.
- `NEEDS DECISION` pauses that cluster and any sharing seam/remedy/files.
  Independent `FIX NOW` / conclusive `NO CHANGE` on other seams may continue.
- Resolve only verified `FIX NOW` and conclusive `NO CHANGE`. Leave decision-
  gated threads unresolved.
- Never force-push, never claim a fix before it is on the branch, never modify
  unrelated files or absorb pre-existing dirty worktree changes.
- Humanizer `pr-reply` on every reply before posting.

## Flow

1. **Setup** — Resolve/checkout open PR; stop if dirty or diverged. Record
   `feedback_start_sha` and `pr_base_sha`. Read description, linked context, and
   `origin/<base>...HEAD`.
2. **Fetch** — Unresolved `reviewThreads` via GitHub GraphQL (thread id, first
   comment `databaseId`, body, path, line, hunk, author). Stop if none.
3. **Triage** — Disposition each cluster (`FIX NOW` / `NO CHANGE` /
   `NEEDS DECISION`). Show one line per independent disposition; full decision
   packet for gated clusters. Pause gated seams.
4. **Fix** — Independent `FIX NOW` only, ranked remedies. Tests only for
   load-bearing invariants at stable seams.
5. **Verify** — Focused checks for fixed invariants, then broader suite by
   risk. Inspect `git diff --numstat` from `feedback_start_sha` and
   `pr_base_sha`. Soft size → ask before commit; gated mechanism growth →
   reclassify `NEEDS DECISION` before commit/push.
6. **Commit/push** — One conventional commit of explicit paths when code
   changed; rebase-pull only when safe; normal push. No empty commit for
   all-`NO CHANGE`.
7. **Reply/resolve** — Humanized one-to-two sentence replies on the first
   comment. Resolve after verified fix or conclusive no-change. Do not
   reply/resolve gated threads until the user decides.

## Report

PR identity; counts and thread→cluster map by disposition; verification;
growth/mechanisms; commit/push; remaining `NEEDS DECISION`. Goal is a reasoned
disposition for every thread, not zero open threads.
