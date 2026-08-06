---
name: pr-publish
description: "Publishes finished work as a GitHub pull request: discovers branch state, drafts or refreshes a layered human-readable PR description (with required humanizer pass), pushes safely, and creates or updates the PR."
argument-hint: "(optional) freeform notes, linked issue, or observability evidence to incorporate"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Glob
  - Grep
  - Skill
  - AskUserQuestion
---

# PR Publish

Publish completed branch work as a PR, or refresh the current branch's existing PR. Treat `$ARGUMENTS` as extra drafting context such as linked issues, incident notes, or validation evidence.

Load `references/github-pr-workflow.md` before making branch or PR decisions. Load `references/pr-description-style.md` when drafting the body. Load `references/reporting-style.md` for tone while drafting (outcome first, meaning before plainness, fewer ideas, claim only verified results).

The PR body is for humans. If a busy reviewer cannot understand the change from the Summary alone, the body is not done.

## Invariants

- Stop on dirty tracked files or diverged local/remote; never force-push; do not
  auto-commit tracked changes.
- On default branch with only untracked files, you may create a feature branch
  and commit those explicit paths.
- Describe the merged end state relative to the base branch — never the journey
  through intermediate commits.
- Required `pr-body` humanizer on title and body before print/publish (inline
  Process by default). Summary must skim in plain language without internal
  type/function names. Do not invent test results.
- Print final title and body before publishing.

## Workflow

1. Discover: status, current/default branch, merge-base commits/diff, current PR.
2. Stop for safety cases in `references/github-pr-workflow.md`.
3. Gather only framing that changes the body (issues, evidence, affected users).
4. Draft title (<70 chars) and body via `pr-description-style.md` +
   `reporting-style.md`; rewrite journey-relative phrasing.
5. Humanize (`pr-body`); re-check base-branch frame. Optional
   `technical-writing` only for rare long procedure sections.
6. Push if needed; create or update the PR (`gh pr create` / edit body; retitle
   only if generated, non-conventional, or over 70 chars).
7. Print the PR URL.

## Output

End with:

```text
PR published: <url>
Title: <title>
```

If stopped for safety, report the exact condition and the next safe command or decision needed from the user.
