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

Load `references/github-pr-workflow.md` before making branch or PR decisions. Load `references/pr-description-style.md` when drafting the body.

The PR body is for humans. If a busy reviewer cannot understand the change from the Summary alone, the body is not done.

## Core Rules

- Do not publish with modified or staged tracked files; ask what belongs in the PR.
- Never force-push.
- If the local and remote branch diverged, stop and ask.
- Do not auto-commit tracked changes.
- If the current branch is the default branch and the only changes are untracked files, you may create a feature branch, stage those explicit new paths, and commit them with an inferred conventional commit message.
- Describe the merged end state **relative to the base branch**, never the path taken to build it. Re-read each sentence as a reviewer who has only seen the base branch and the diff, and cut anything that presupposes the branch's commit history (see `references/pr-description-style.md`).
- **Required humanizer pass** on the title and body before printing or publishing (see Workflow step 6). Do not ship AI jargon, significance inflation, or implementation-symbol dumps in the Summary.
- Print the final title and body before publishing so the transcript records what was sent.

## Workflow

1. Discover state in parallel:
   - `git status --short --branch`
   - current branch and default branch
   - commits and diff from the merge base
   - current branch PR via `gh pr view --json number,body,title,state,baseRefName,headRefName,url`
2. Stop for the safety cases in `references/github-pr-workflow.md`.
3. Gather only framing context that materially changes the PR body:
   - linked issue or incident references from commits, branch name, PR body, or `$ARGUMENTS`
   - reproduction, logs, dashboards, or validation evidence for bug fixes
   - affected users, services, or operators when not obvious from the diff
4. Draft a conventional-commit title under 70 characters.
5. Draft the body using `references/pr-description-style.md`, then re-read each sentence against the base-branch frame and rewrite any journey-relative phrasing.
6. **Humanizer pass (required):** apply `djenriquez-core:humanizer` in `pr-body` mode to the title and body.
   - Claude Code: invoke `/humanizer` with mode `pr-body`, or load `skills/humanizer/SKILL.md` and `references/humanizer-patterns.md` and apply the pass inline.
   - Codex: read the installed `djenriquez-core:humanizer` skill and patterns reference; apply the pass.
   - Preserve structure and technical claims. Prefer shorter. Summary must read in plain language without internal type/function names.
   - Re-run the base-branch frame check on the humanized text. Do not publish until this pass completes.
7. Push the branch normally if it is not already on origin.
8. Create or update the PR:
   - no existing PR: `gh pr create --title "<title>" --body "<body>"`
   - existing open PR: update the body; update the title only if it is generated, non-conventional, or over 70 characters
9. Print the PR URL.

## Output

End with:

```text
PR published: <url>
Title: <title>
```

If stopped for safety, report the exact condition and the next safe command or decision needed from the user.
