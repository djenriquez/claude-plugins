---
name: pr-figure
description: >
  Generates one LLM reviewer diagram for a GitHub pull request, hosts it as a
  GitHub user-attachment without committing, and posts it as a comment or
  returns markdown for a PR body. Use when the user asks for a PR figure,
  reviewer diagram, image on a PR, a picture of the change, or when
  pr-publish needs the figure. Works from any checkout; pass a PR URL such as
  https://github.com/djenriquez/claude-plugins/pull/34 or OWNER/REPO#N.
argument-hint: "[PR URL|#N] [comment|body|url]"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Bash(python3:*)
  - Bash(curl:*)
  - Read
  - Glob
  - Grep
  - AskUserQuestion
---

# PR Figure

One diagram of the merged end state so a busy reviewer does not have to
reconstruct architecture from prose. Drawing rules, prompt skeleton, harness
table, and hosting fallbacks live in `references/pr-figure.md` — load it
before generating.

## Callers

| Caller | Placement |
|--------|-----------|
| `pr-publish` | `body` (embed after Summary) |
| Standalone | `comment` unless the user asks for body or URL-only |

Callers run this Process inline by default. Nested `/pr-figure` is optional.

## Arguments

`$ARGUMENTS` may include a PR reference (`#N`, `N`, or
`https://github.com/OWNER/REPO/pull/N`) and a placement (`comment`, `body`,
`url`). If the PR is omitted, use the current branch's PR (see
`references/github-pr-workflow.md`). Do not guess a number from recent
history. A full GitHub URL is enough even when the current workspace is a
different repository.

## Process

1. Resolve the PR and its `OWNER/REPO` from the URL or `gh pr view --repo`.
   Use the PR's base repository, including for fork PRs. A local checkout of
   that branch is optional for figure-only work. Read its visibility before
   hosting. If the user requires a non-public figure and the repository is
   public, keep the figure local.
2. Load title, body, changed files, and the base-branch diff (`gh pr diff`
   or `git diff <base>...HEAD` when that checkout is the PR head). Ground the
   prompt only in that evidence.
3. Load `references/pr-figure.md`. Skip when that reference says to skip.
4. Fill the prompt skeleton. Generate **once**. Read the image. Retry **once**
   only for invented "Do not draw" items, dropped numbered actors, or
   marketing art. Then stop.
5. Copy the file to `$TMPDIR` / `/tmp`. Upload from the `djenriquez-core`
   plugin root:

   ```sh
   python3 skills/pr-figure/scripts/upload_github_asset.py "$FIGURE_PATH" --repo OWNER/REPO
   ```

6. The uploader binds the attachment to that repository and verifies access
   before printing a URL. Public figures must load anonymously; private and
   internal figures must load with authentication and deny anonymous access.
   An anonymous `404` alone does not mean the upload failed. On verification
   failure, keep the local file and report the reason; do not post the URL or
   widen permissions. Follow the reference's response to an exposed private
   attachment. Do not use public hosting fallbacks or scrape GitHub cookies.
7. Deliver:
   - `comment`: `gh pr comment --repo OWNER/REPO` with `![title](url)` and a
     one- or two-sentence `pr-reply` note. Not a commit.
   - `body`: return `![title](url)` for the caller to embed.
   - `url`: print the asset URL.
8. Delete workspace copies after upload and access verification succeed
   (commit fallback in the reference is the exception).

## Output

```text
Figure: <asset-url | skipped: <reason>>
Placement: comment|body|url
PR: <url>
```
