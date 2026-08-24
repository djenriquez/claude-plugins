---
name: audit-decisions
description: "Reports silent decisions in agent-authored work: an independent read-only pass lists every choice the spec or request did not prescribe, in plain language, least-confident first. Not a code review, not a PR body, and it cannot change code or block merge."
argument-hint: "[PR number, branch name, 'staged', 'unstaged', commit SHA, file path, or spec path]"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Glob
  - Grep
  - Agent
  - Task
  - Skill
  - AskUserQuestion
---

# Audit Decisions

Ledger of silent decisions — not critique, not a digest of what changed, not
feedback handling. The object of review is the guesses, not the dump.

Target: `$ARGUMENTS`. If missing, use the current branch's open PR; otherwise
unstaged changes when the tree is dirty; otherwise ask.

Load `protocols/decision-audit-protocol.md` before spawning the auditor.
Load `references/github-pr-workflow.md` only for PR or branch mechanics.
Load `references/harness-adapters.md` only when spawning across harnesses.
Load `references/reporting-style.md` while presenting. Required humanizer
pass in `ledger` mode before presenting (inline Process by default).

## Invariants

- Independent auditor: a fresh, context-free, read-only sub-agent authors
  the ledger. This session gathers and presents; it does not self-audit.
- No mutation: no edits, commits, pushes, or GitHub review posts. The ledger
  never blocks merge by itself.
- Silent decisions only: choices the spec or request did not prescribe.
  Not defects, not prescribed work, not mechanical formatting.
- Least-confident first. Confidence is coarse (`low` / `medium` / `high`)
  and grounded in how underdetermined the choice was. Do not invent finer
  scores or unverified certainty.
- If spawn fails, stop. Do not fall back to a same-session audit.

## Gather

Resolve the work target the same way as `code-review`:

- PR number or URL: `references/github-pr-workflow.md`; inspect local `HEAD`
  against `origin/<baseRefName>` when already on the branch. Do not checkout
  a dirty tree.
- branch name: `git diff <base>...<branch>`
- `staged`: `git diff --cached`
- `unstaged` or no qualifier with a dirty tree: `git diff`
- commit SHA: `git show <sha>`
- file path: read the file and infer context
- spec path: treat as the request source; still resolve a work target

Collect:

- changed-file inventory, line counts, file count
- request sources: explicit spec path, PR body, linked issues, mentioned
  `docs/specs/` files, freeform notes in `$ARGUMENTS`
- nearby house patterns only when needed to tell a guess from an existing
  rule

For large targets, keep inventory and targeted diff commands in the auditor
prompt. Do not paste this session's private reasoning as if it were the spec.

## Spawn

Load `references/harness-adapters.md`. Spawn one fresh read-only auditor:

- Claude Code: `Task` with `agents/decision-auditor.md`
- Cursor: `Task` (`explore` or `generalPurpose`); instruct it to load the
  protocol and agent file
- Codex: `spawn_agent` with `fork_context: false`; prefer `explorer`

Give the auditor:

- repo path and work target
- request/spec paths (not a pasted manifesto)
- changed-file inventory
- `protocols/decision-audit-protocol.md`
- targeted commands such as `git diff <base>...HEAD -- <path>`

The auditor returns the ledger as its final response body. Retry a failed
spawn once. A second failure is a stop.

## Present

Drop only protocol-violating items (findings, invented confidence, non-silent
entries). Do not add decisions the auditor did not report. Do not reorder
except to restore least-confident-first if the auditor slipped.

Humanize (`ledger`). Present. Stay in Q&A on the ledger (read more files if
asked). Pushback is the point. Do not turn pushback into code changes from
this skill.
