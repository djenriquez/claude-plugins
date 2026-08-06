---
name: pr-digest
description: "Loads full context of a GitHub PR (diff, description, linked issues, commit history, review threads, CI status), produces a structured narrative summary grouped by logical concern, and stays ready for follow-up Q&A."
argument-hint: "#N or N (PR number)"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Glob
  - Grep
  - Skill
  - AskUserQuestion
  - WebFetch
---

# PR Digest

Comprehension aid for a PR — not critique, not feedback handling, not review.
Target: `$ARGUMENTS` (`#N`, `N`, or PR URL). Ask if missing.

Load `references/reporting-style.md` while drafting. Required humanizer pass in
`digest` mode before presenting (inline Process by default).

## Invariants

- Neutral explanation only — no findings, verdicts, or approve advice.
- Group by logical concern, not a file inventory dump.
- Omit empty or obvious sections; do not invent risk or test claims.
- After the digest, stay in Q&A on the loaded context (read more files if asked).

## Gather

In parallel where possible:

- Metadata: `gh pr view <N> --json` (title, body, author, branches, state,
  labels, size, dates)
- Commits, full diff, CI checks
- Linked issues from description/commits
- Unresolved and recent review threads (GraphQL `reviews` / `reviewThreads`)
- Full text of the most important ~5–8 changed files (core over tests/config)

Closed or merged PRs are fine — note state and continue.

## Digest shape

Lead with identity (number, title, author, branches, size, status, checks).
Then, only sections that earn space:

| Section | Intent |
|---------|--------|
| Intent | Why this exists (plain language; link issues) |
| What changed | Groups by concern; files as supporting bullets |
| Key decisions | Non-obvious choices only |
| Risk surface | Factual blast radius, not speculation |
| Testing | What tests cover; note gaps factually |
| Open threads | Unresolved discussions, or "none" |
| Commit walkthrough | Multi-commit PRs only |

Narrative over inventory. Match the codebase's technical level. File/line refs
for jump-off points.

## After

Present the humanized digest, then invite questions. Stay in comprehension mode
if asked whether to approve — share observations, do not decide for them.
