---
name: self-review-loop
description: "Iteratively reviews a PR with fresh read-only reviewers, applies blocking feedback locally, verifies changes, and pushes one final squashed self-review commit only after a clean final review."
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

Target PR: `$ARGUMENTS`. If absent, ask for a PR number.

Load `references/github-pr-workflow.md` for PR parsing, checkout, branch safety, and local diff rules. Load `protocols/feedback-disposition.md` before triage or mutation. Load `references/feedback-disposition-fixtures.md` when a disposition is ambiguous. Load `references/harness-adapters.md` only when translating agent or skill invocation across harnesses.

## Invariants

- Reviewers are fresh, read-only, and do not inherit prior review turns.
- The review target is local `HEAD` against `origin/<baseRefName>`, not the remote PR diff after local review commits exist.
- The loop succeeds only when the latest fresh review has no unresolved Critical/High findings after severity normalization.
- Only demonstrated blocking findings can cause loop edits. After evidence validation, concrete correctness, security, data-loss, broken-contract, or failing-verification issues are blocking regardless of the reviewer's Medium/Low label. Remaining Medium/Low findings and non-actionable observations do not create fix turns.
- `NEEDS DECISION` pauses mutation only for the gated cluster and clusters that share its remedy or files. Independent `FIX NOW` work may continue. Leave gated findings unresolved and do not treat the turn as clean.
- Max turns, oscillation, and final-review failures are blocked states.
- Per-turn commits stay local. Push only one final squashed self-review commit.
- Never force-push.

## Setup

1. Resolve and checkout the PR using `references/github-pr-workflow.md`.
2. Confirm the PR is open.
3. Record:
   - `review_base_sha=$(git rev-parse HEAD)` immediately after checkout/pull
   - `pr_base_sha=$(git merge-base "origin/<baseRefName>" HEAD)`
   - upstream branch
   - current branch
   - PR base and head refs
   - changed-file inventory from `git diff --name-status origin/<baseRefName>...HEAD`
4. Detect the verification command from project files or CI. If none exists, record `no test suite detected`.
5. Choose the review path:
   - prefer the local lean `djenriquez-core:code-review` skill when available
   - otherwise use direct fresh-review prompts that follow the same L0/L1/L2 staged policy from `skills/code-review/SKILL.md`
   - do not invoke nested review-team skills, including imported heavy team reviews, unless compatibility is proven and the user asked for that heavier path

## Review Loop

Run at most 10 turns.

For each turn:

1. Record `turn_start_sha=$(git rev-parse HEAD)`.
2. Spawn a fresh read-only reviewer or invoke the local lean code-review skill with no prior turn context.
3. Give the reviewer the repo path, PR number, base ref, and changed-file inventory.
4. For small diffs, the reviewer may inspect the full local diff. For large diffs, instruct it to inspect targeted paths with:
   `git diff origin/<baseRefName>...HEAD -- <path>`
5. Require findings grouped by Critical, High, Medium, and Low with file/line references and a verdict. Keep any non-actionable Observations separate.
6. Revalidate every potential blocker against `protocols/code-review-protocol.md` and `protocols/feedback-disposition.md`. Normalize severity only after the evidence bar is met. After evidence validation, treat concrete correctness, security, data-loss, broken-contract, or failing-verification issues as blocking Critical/High findings even when the reviewer labeled them Medium or Low. Do not elevate speculative or weakly evidenced Medium/Low findings.
7. Record remaining Medium/Low findings and Observations without changing code. If no demonstrated blocking findings remain, leave the loop.
8. Group blocking findings by root cause, keep a mapping to every original finding, and classify each cluster as `FIX NOW`, `NO CHANGE`, or `NEEDS DECISION`.
9. If any cluster is `NEEDS DECISION`, present the compact triage and full decision packet for that cluster. Pause mutation only for the gated cluster and clusters that share its remedy or files. Independent `FIX NOW` clusters may proceed. Do not treat the turn as clean while a gated cluster remains open.
10. Apply only independent `FIX NOW` changes. If a finding targets a mechanism introduced by an earlier loop fix, simplify or remove that fix before stacking another mechanism.
11. If Go code is touched, load `references/code-health-standards-go.md` and apply it only to touched code as advisory guidance.
12. If this turn creates or moves package/module boundaries, run a structural pass using `references/structure-standards.md` and the Go addendum when relevant.
13. Run detected verification. If verification fails because of this turn, fix before continuing. If failure is pre-existing, record evidence and continue.
14. Report change growth and mechanisms for these ranges:
    - this turn from `turn_start_sha`
    - the self-review run from `review_base_sha`
    - the total PR from `pr_base_sha`
15. If the implemented diff adds or widens a gated mechanism, stop before commit for that cluster and reclassify it as `NEEDS DECISION`. If it is only large by the soft size signal, report the growth and ask before commit.
16. Commit this turn's self-review changes locally with a message that names the turn and summarizes the fixed root causes.

If a review attempt times out, hits a transport error, returns null or invalid output, or disconnects mid-stream, retry that same review path once. If the retry also fails, fall back to a direct fresh read-only review when the failed path was a skill invocation; if direct review fails twice, stop as blocked and report the failure mode.

Detect oscillation after turn 2. If current changed files significantly overlap with files changed two turns earlier and reviewers are undoing prior fixes, stop as blocked.

## Optional Cross-Model Debate

Do not load `protocols/mcp-debate.md` during setup. After a clean main-loop review, consider debate only when:

- the PR is high-risk or security-sensitive
- multiple review turns skipped disputed blocking feedback
- the final merge decision depends on a judgment call

Before any external-model call, ask one run/skip checkpoint. If approved, load `protocols/mcp-debate.md` and follow its discovery, model pinning, prompt-size, and failure handling rules. Apply `protocols/feedback-disposition.md` to any debate finding before changing code.

If debate causes code changes, commit them locally and run one more fresh read-only review. If that final review has unresolved blocking findings, stop as blocked and do not push.

## Squash And Push

Only publish when:

- the stop reason is a clean review
- required post-debate final review is clean
- the working tree is clean

Verify the range from `review_base_sha..HEAD` contains only commits created by this self-review run. If unrelated commits are present, stop and ask before rewriting local history.

Squash local self-review commits with a non-interactive soft reset, create one final commit, pull with rebase, rerun relevant verification if the commit changes or conflicts were resolved, then push normally.

Never use `--force` or `--force-with-lease`.

## Final Summary

Report:

- PR number, branch, base, status, stop reason, and turn count
- review path used and why
- root-cause dispositions and original-finding mappings
- verification commands and results
- per-turn, self-review-run, and total PR change growth
- mechanisms added, widened, and removed
- optional debate status
- final commit and push status, or blocked-state reason
