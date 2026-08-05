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

Target PR: `$ARGUMENTS`. If absent, ask for a PR number.

Load `references/github-pr-workflow.md` for PR parsing, checkout, branch safety, and local diff rules. Load `protocols/feedback-disposition.md` before triage or mutation. Load `references/feedback-disposition-fixtures.md` when a disposition is ambiguous. Load `references/harness-adapters.md` only when translating agent or skill invocation across harnesses.

Optimize for a simpler correct design, not for clearing reviewer findings with local patches.

## Invariants

- Reviewers are fresh, read-only, and do not inherit prior review turns.
- The review target is local `HEAD` against `origin/<baseRefName>`, not the remote PR diff after local review commits exist.
- The loop succeeds only when both are true after the latest fresh review:
  - no unresolved Critical/High findings after severity normalization
  - the self-review run did not add or widen mechanisms without a ranked-remedy justification or explicit user decision
- Only demonstrated blocking findings can cause loop edits. After evidence validation, concrete correctness, security, data-loss, broken-contract, or failing-verification issues are blocking regardless of the reviewer's Medium/Low label. Remaining Medium/Low findings and non-actionable observations do not create fix turns.
- Before mutating a `FIX NOW` cluster, rank remedies as remove/simplify, then owning-seam fix, then local patch. Prefer deletion and seam fixes over defensive branches.
- `NEEDS DECISION` pauses mutation for the gated cluster and any cluster that shares its owning seam, remedy, or files. Do not land more patches on a gated seam. Independent `FIX NOW` work on other seams may continue. Leave gated findings unresolved and do not treat the turn as clean.
- Same-seam blocking findings after an earlier fix in this run escalate to `NEEDS DECISION` instead of another local patch.
- At most 3 fix-mutation turns without an explicit user continue. Hard cap is 10 review turns. Max turns, oscillation, unexplained mechanism growth, and final-review failures are blocked states.
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
   - empty `fixed_seams` and `fix_mutation_turns=0`
4. Detect the verification command from project files or CI. If none exists, record `no test suite detected`.
5. Choose the review path:
   - prefer the local lean `djenriquez-core:code-review` skill when available
   - otherwise use direct fresh-review prompts that follow the same L0/L1/L2 staged policy from `skills/code-review/SKILL.md`
   - do not invoke nested review-team skills, including imported heavy team reviews, unless compatibility is proven and the user asked for that heavier path

## Review Loop

Run at most 10 review turns. Perform at most 3 turns that mutate code unless the user explicitly authorizes another fix-mutation turn.

For each turn:

1. Record `turn_start_sha=$(git rev-parse HEAD)`.
2. Spawn a fresh read-only reviewer or invoke the local lean code-review skill with no prior turn context.
3. Give the reviewer the repo path, PR number, base ref, and changed-file inventory.
4. For small diffs, the reviewer may inspect the full local diff. For large diffs, instruct it to inspect targeted paths with:
   `git diff origin/<baseRefName>...HEAD -- <path>`
   After any prior fix-mutation turn, also require the reviewer to inspect the full self-review delta:
   `git diff "$review_base_sha"...HEAD`
5. Require findings grouped by Critical, High, Medium, and Low with file/line references and a verdict. Keep any non-actionable Observations separate.
6. Revalidate every potential blocker against `protocols/code-review-protocol.md` and `protocols/feedback-disposition.md`. Normalize severity only after the evidence bar is met. After evidence validation, treat concrete correctness, security, data-loss, broken-contract, or failing-verification issues as blocking Critical/High findings even when the reviewer labeled them Medium or Low. Do not elevate speculative or weakly evidenced Medium/Low findings.
7. Record remaining Medium/Low findings and Observations without changing code. If no demonstrated blocking findings remain, check mechanism growth from `review_base_sha`. If mechanisms were added or widened without ranked-remedy justification or an explicit decision, stop as blocked. Otherwise leave the loop cleanly.
8. Group blocking findings by root cause and owning seam, keep a mapping to every original finding, and classify each cluster as `FIX NOW`, `NO CHANGE`, or `NEEDS DECISION`.
9. If a blocking finding's owning seam is already in `fixed_seams`, reclassify it as `NEEDS DECISION` with remove/simplify, reshape, and narrowly accepted local patch as options. Do not apply another local patch on that seam.
10. If any cluster is `NEEDS DECISION`, present the compact triage and full decision packet. Pause mutation for that cluster and any cluster that shares its owning seam, remedy, or files. Independent `FIX NOW` clusters on other seams may proceed. Do not treat the turn as clean while a gated cluster remains open.
11. Before the second or later fix-mutation turn, run an approach checkpoint over `git diff "$review_base_sha"...HEAD` and the pending blockers:
    - Did earlier fixes remove complexity or paper over the original approach?
    - Is the owning seam still the right place for the invariant?
    - Would reverting or reshaping the approach beat another patch?
    If the checkpoint says the approach is wrong or another patch would stack mechanisms, stop as `NEEDS DECISION` / blocked rather than mutating.
12. If `fix_mutation_turns` is already 3, stop and ask before any further mutation.
13. For each independent `FIX NOW` cluster, rank the remedy (`remove/simplify`, then seam, then local) and apply only the chosen option. If a finding targets a mechanism introduced by an earlier loop fix or by the PR approach, simplify or remove that mechanism before adding another.
14. If Go code is touched, load `references/code-health-standards-go.md` and apply it only to touched code as advisory guidance.
15. If this turn creates or moves package/module boundaries, or the approach checkpoint questions package shape, run a structural pass using `references/structure-standards.md` and the Go addendum when relevant.
16. Run detected verification. If verification fails because of this turn, fix before continuing only with ranked remedies that do not evade same-seam or complexity rules. If failure is pre-existing, record evidence and continue.
17. Report change growth and mechanisms for these ranges:
    - this turn from `turn_start_sha`
    - the self-review run from `review_base_sha`
    - the total PR from `pr_base_sha`
18. If the implemented diff adds or widens a gated mechanism, stop before commit for that cluster and reclassify it as `NEEDS DECISION`. If it is only large by the soft size signal, report the growth and ask before commit. If the turn added mechanisms, record the ranked-remedy justification or stop.
19. Commit this turn's self-review changes locally with a message that names the turn, the seams fixed, and the remedy ranks used.
20. Append each fixed owning seam to `fixed_seams` and increment `fix_mutation_turns`.

If a review attempt times out, hits a transport error, returns null or invalid output, or disconnects mid-stream, retry that same review path once. If the retry also fails, fall back to a direct fresh read-only review when the failed path was a skill invocation; if direct review fails twice, stop as blocked and report the failure mode.

Detect oscillation after turn 2. If current changed files significantly overlap with files changed two turns earlier and reviewers are undoing prior fixes, or if mechanism count grows while the same seams keep surfacing blockers, stop as blocked.

## Optional Cross-Model Debate

Do not load `protocols/mcp-debate.md` during setup. After a clean main-loop review, consider debate only when:

- the PR is high-risk or security-sensitive
- multiple review turns skipped disputed blocking feedback
- the final merge decision depends on a judgment call

Before any external-model call, ask one run/skip checkpoint. If approved, load `protocols/mcp-debate.md` and follow its discovery, model pinning, prompt-size, and failure handling rules. Apply `protocols/feedback-disposition.md` to any debate finding before changing code.

If debate causes code changes, commit them locally and run one more fresh read-only review. If that final review has unresolved blocking findings or unexplained mechanism growth, stop as blocked and do not push.

## Squash And Push

Only publish when:

- the stop reason is a clean review
- required post-debate final review is clean
- the self-review run has no unexplained mechanism growth
- the working tree is clean

Verify the range from `review_base_sha..HEAD` contains only commits created by this self-review run. If unrelated commits are present, stop and ask before rewriting local history.

Squash local self-review commits with a non-interactive soft reset, create one final commit, pull with rebase, rerun relevant verification if the commit changes or conflicts were resolved, then push normally.

Never use `--force` or `--force-with-lease`.

## Final Summary

Report:

- PR number, branch, base, status, stop reason, and turn count
- review path used and why
- root-cause dispositions, owning seams, remedy ranks, and original-finding mappings
- approach-checkpoint outcome when a second or later fix turn was considered
- verification commands and results
- per-turn, self-review-run, and total PR change growth
- mechanisms added, widened, and removed, with justification or decision status
- optional debate status
- final commit and push status, or blocked-state reason
