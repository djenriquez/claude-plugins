---
name: code-review
description: "Runs a lean, risk-scaled code review: one generalist pass first, specialists only when triggered by evidence, and external debate only for high-risk escalation."
argument-hint: "[PR number, branch name, 'staged', 'unstaged', commit SHA, or file path]"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
  - ToolSearch
mcpServers:
  - claude
  - codex
---

# Code Review

Review the target in `$ARGUMENTS`. If no target is provided, review the unstaged working tree if it has changes; otherwise ask what to review.

Load `protocols/code-review-protocol.md` before writing findings. Load `references/github-pr-workflow.md` only for PR or branch review mechanics. Load `references/harness-adapters.md` only when spawning agents across harnesses.

## Principles

- Start with one strong generalist review.
- Add specialists only when the diff or generalist findings show a concrete risk signal.
- Do not paste large full diffs into every sub-agent prompt.
- Do not run external-model debate as a default phase.
- Produce fewer, stronger findings.

## Gather Target

Resolve the review target:

- PR number or URL: use `references/github-pr-workflow.md`; inspect local `HEAD` against `origin/<baseRefName>` after checkout.
- branch name: compare against the appropriate base with `git diff <base>...<branch>`.
- `staged`: `git diff --cached`.
- `unstaged` or no qualifier: `git diff`.
- commit SHA: `git show <sha>`.
- file path: read the file and infer review context.

Collect:

- changed-file inventory
- line counts and file count
- PR description, linked issue, and checks when available
- relevant tests for changed production code

For large targets, keep only the inventory and targeted diff commands in reviewer prompts.

## Classify Risk

- `L0`: docs/config/dependency bump, one-line fix, generated-only change, or established pattern with tiny blast radius.
- `L1`: new feature, refactor, API behavior change, shared code, production code with tests, or 3+ changed files.
- `L2`: auth, security, payments, PII, data model, migrations, public API, architecture boundary, 10+ files, or high production blast radius.

Oversized or mixed-concern PRs are reviewability risks. For >1000 changed lines, explicitly assess whether the change should be split.

## Run The Staged Review

### L0

Run one concise generalist review. Do not spawn a specialist team. Do not run debate.

### L1

Run one generalist review first. Then trigger at most two specialists when evidence warrants:

- `security`: auth, authorization, secrets, user input, network, deserialization, crypto, PII
- `performance`: database queries, hot loops, caching, network calls, unbounded memory or I/O
- `testing`: production code with weak/missing tests, bug fix without regression coverage, flaky-looking tests
- `architecture`: new modules, dependency direction changes, package boundaries, public API shape
- `maintainability`: new abstractions, complex control flow, broad refactors, naming/domain clarity

If no trigger is present and the generalist pass is strong, synthesize immediately.

### L2

Run the generalist pass, then select the minimal specialist set needed for the risk. Cap specialists at four unless the user explicitly asks for a heavy review. Prefer security, correctness, testing, and architecture for high-risk changes.

## Reviewer Prompts

Give every reviewer:

- repo path and review target
- risk lane
- changed-file inventory
- relevant PR/issue context
- `protocols/code-review-protocol.md`
- targeted commands such as `git diff <base>...HEAD -- <path>`

Only include full diff text for small targets. For large targets, require reviewers to state which files and call sites they inspected.

## Optional Debate

Load `protocols/mcp-debate.md` only when one of these is true:

- a Critical/High finding is plausible but uncertain
- specialists disagree on a blocking finding
- the review is `L2` and the final verdict depends on judgment

Use debate to falsify or strengthen findings, not to generate a second full review. Ask one run/skip checkpoint before external-model calls.

## Synthesize

Deduplicate findings, normalize severity with `protocols/code-review-protocol.md`, and remove weak or speculative comments. Include coverage, triggered specialists, skipped specialists, and debate status when relevant.

End with `## Verdict: APPROVE` or `## Verdict: REQUEST CHANGES` as the final section.
