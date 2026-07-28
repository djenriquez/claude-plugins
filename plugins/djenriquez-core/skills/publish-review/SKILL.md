---
name: publish-review
description: "Publish existing code-review findings as one GitHub PR review with inline comments. Use when the user says /publish-review, publish the review, leave these as PR comments, post this review on the PR, drop these in as inline comments, or comment on the PR with these findings. Not for generating review findings, replying to existing threads, handling feedback, or one-off conversational comments."
version: "0.1.0"
license: MIT
compatibility: "Portable Agent Skills format. Requires a POSIX shell, authenticated GitHub CLI, network access to GitHub, and read/write filesystem access for a temporary JSON payload."
dependencies:
  - "gh: GitHub CLI, authenticated with permission to write pull request reviews"
  - "POSIX shell"
  - "read/write filesystem access for a temporary JSON payload file"
allowed-tools: Bash(gh:*) Bash(git:*) Bash(command:*) Bash(rm:*) Bash(cat:*) Bash(test:*) Read Write Skill AskUserQuestion
---

# Publish Review

Publish already-written review findings as inline comments on a GitHub pull request. This skill does not perform code review. It only resolves the target PR, validates anchors, rewrites the wording into review-ready human voice, previews the review, and submits one grouped GitHub review.

The default outcome is one `COMMENT` review so the author gets one notification. Use `REQUEST_CHANGES` only when at least one finding is `critical` or `high` and the caller explicitly opted into a blocking review.

## Inputs

Collect these before publishing:

- **PR reference**: `#N`, `N`, or a GitHub PR URL. Extract `owner`, `repo`, and PR number. If absent and the current directory is a clone with an open PR for the current branch, default from `gh pr view --json number,baseRepository`. Otherwise prompt.
- **Findings list**: each finding has `path`, `line`, `body`, and `severity`. Severity must be one of `critical`, `high`, `medium`, `low`, or `nit`. Accept `start_line` when the caller provides a range.
- **Optional preamble**: a one-sentence top-level review body. Default to `A few thoughts on this.`
- **Optional auto-confirm**: a caller-supplied `--auto`, `confirm: true`, or equivalent host flag may skip preview confirmation. Default is preview and explicit confirmation.
- **Optional blocking review**: a caller-supplied `--request-changes`, `blocking: true`, or equivalent host flag may set `event` to `REQUEST_CHANGES` when any finding is `critical` or `high`.
- **Optional closed-PR opt-in**: a caller-supplied `--include-closed`, `allow_closed: true`, or equivalent host flag is required before posting on a closed or merged PR.

If the findings list is empty, stop. Do not post an empty review.

## Preflight

Run shell commands for preflight. Fail loudly with a clear message, not a raw API error:

```sh
command -v gh >/dev/null 2>&1 || {
  printf '%s\n' 'publish-review requires the GitHub CLI. Install gh and retry.'
  exit 1
}

gh auth status >/dev/null 2>&1 || {
  printf '%s\n' 'publish-review requires an authenticated GitHub CLI. Run: gh auth login'
  exit 1
}
```

Use a temporary file for the JSON payload. Prefer `mktemp` when available, but do not require it:

```sh
if command -v mktemp >/dev/null 2>&1; then
  tmpfile=$(mktemp "${TMPDIR:-/tmp}/publish-review.XXXXXX") || exit 1
else
  i=0
  while :; do
    tmpfile="${TMPDIR:-/tmp}/publish-review.$$.${i}"
    (umask 077 && set -C && : > "$tmpfile") 2>/dev/null && break
    i=$((i + 1))
    test "$i" -lt 100 || exit 1
  done
fi
```

Remove the temp file after the API call succeeds or fails.

## Resolve The PR

Normalize the PR reference:

- URL like `https://github.com/OWNER/REPO/pull/123`: use `OWNER/REPO` and `123`.
- `#123` or `123`: use that number. Resolve `OWNER/REPO` from the current checkout with `gh repo view --json nameWithOwner --jq .nameWithOwner`, or from `gh pr view 123 --json baseRepository`.
- No reference: try the current branch's open PR:

```sh
gh pr view --json number,baseRepository \
  --jq '"\(.baseRepository.owner.login)/\(.baseRepository.name) \(.number)"'
```

If no PR can be resolved, prompt for a PR reference.

Fetch PR metadata:

```sh
gh pr view "$number" --repo "$owner/$repo" \
  --json state,mergedAt,isDraft,url,number,baseRepository
```

If the PR is closed or merged, warn and require explicit closed-PR opt-in before proceeding.

Fetch the latest commit SHA and stop if it is missing:

```sh
sha=$(gh pr view "$number" --repo "$owner/$repo" \
  --json commits --jq '.commits[-1].oid // empty')
test -n "$sha" || {
  printf '%s\n' 'Cannot publish review: this PR has no commits.'
  exit 1
}
```

GitHub anchors review comments to a commit. Do not reuse a cached SHA.

## Validate Diff Anchors

Fetch the diff once for validation:

```sh
gh pr diff "$number" --repo "$owner/$repo" > "$diff_file"
```

Verify every finding before publishing:

- Match the finding's `path` to a `diff --git` file section.
- Parse hunk headers like `@@ -old_start,old_count +new_start,new_count @@`.
- Track new-file line numbers through the hunk. A space line and a `+` line advance the new-file line. A `-` line does not.
- A single-line finding is valid only if its `line` appears in that file's hunk as a `+` line or context line.
- A range finding is valid only if every line from `start_line` through `line` is valid in the same file hunk.
- Do not anchor to deleted-only lines. If the caller needs to comment on removed code, ask whether to convert the point into a top-level review note.

When a line is not in the diff, do not silently shift it. Surface the invalid anchor and the nearest valid line in the same file:

```text
Cannot anchor path/to/file.go:84. Closest valid diff line is 79.
Choose one: drop this finding, attach to 79, or convert it to the top-level review body.
```

Only move a comment to the nearest line after explicit user confirmation. If converted to the top-level body, append a short unanchored note such as `path/to/file.go:84: <rewritten body>`.

## Voice Pass (required humanizer)

Rewrite each finding body before previewing or posting. Preserve the technical claim, severity, path, and line. Do not add new findings.

**Required:** apply `djenriquez-core:humanizer` in `review-comment` mode to every finding body and the optional preamble.

- Claude Code: invoke `/humanizer` with mode `review-comment`, or load the skill and apply the pass inline.
- Codex: read the installed `djenriquez-core:humanizer` skill and apply.
- Preserve the technical claim's force (do not soften a correctness bug into a vague suggestion). Do not invent evidence.

The target voice is a senior engineer typing directly into GitHub: specific, brief, and calm. The comment should read like it was written for a teammate who already has the diff open.

Rules (also encoded in the humanizer `review-comment` mode — apply all of them):

- Use short sentences. Most comments should be 2-4 sentences.
- Point at the mechanism, not the author. Say `This shifts the retained window on every eviction`, not `your code shifts...`.
- Explain why the issue matters in concrete runtime, API, correctness, maintainability, or operator terms.
- For design tradeoffs, acknowledge the tradeoff and end with a real question. Good shape: `Conscious tradeoff, or worth a second look?`
- For nits, soften when appropriate with `Not worth doing speculatively` or `just flagging`.
- Reference specific files, lines, docs, or PR numbers when relevant.
- Strip severity labels like `Critical:`, `High:`, `Medium:`, `Low:`, and `Nit:` from the original body before adding the final nit prefix.
- Prefix `low` and `nit` findings with exactly `Nit: ` after rewriting. Do not prefix `critical`, `high`, or `medium`.
- Do not use markdown headers inside inline comments.
- Avoid bullet lists unless the comment needs to name multiple concrete locations.
- Avoid corporate openers like `I noticed`, `It would be a good idea to`, `Consider`, `Based on my analysis`, and `Just wanted to flag`.
- Avoid closing pleasantries.
- Avoid em dashes when commas, parentheses, or a separate sentence work.
- Do not restate obvious file facts. Assume the reader has the code open.
- Do not pad criticism with generic praise.
- Avoid using `PR`, `this PR`, or `your change` as the subject when a file, function, behavior, or line can be the subject.
- Strip AI jargon and significance inflation (`leverages`, `ensures`, `robust`, `comprehensive`, `it is important to note`).

Rewrite these anti-patterns:

- `This PR introduces X` -> `X`
- `It might be worth considering X` -> `Worth a flag?` or `Worth a second look?`
- `I think we should X` -> state the position directly.
- `The code does X. This is because Y.` -> `X, because Y.`
- Numbered or bulleted recommendations in one inline comment -> collapse to prose unless the list identifies multiple concrete locations.
- Severity labels inside the body -> strip them.

Good substantive shape:

```text
This keeps the old cache entry alive after the key rotates, so a failed refresh can still serve data for the previous tenant. The fast path is simpler this way, but it also means an auth miss can become a cross-tenant read. Was that fallback intentional, or should the stale entry be scoped to the same tenant before reuse?
```

Good nit shape:

```text
Nit: the timeout is hardcoded here while the outer retry budget is configurable. Not worth doing speculatively, but a flag would let operators tune this if production latency moves.
```

If the rewritten text does not read like a human GitHub review comment, rewrite it again before previewing.

## Preview And Confirm

Before posting, show the user:

- PR URL and resolved `owner/repo#number`
- Review event: `COMMENT` or `REQUEST_CHANGES`
- Top-level body
- Each inline comment as `path:line severity`, followed by the rewritten body
- Any unanchored notes that will be appended to the top-level body

Publishing review comments is socially visible and notifies the author. Wait for an explicit confirmation such as `yes`, `post`, or `publish` unless the caller passed an auto-confirm flag.

## Build The Payload

Write a JSON object to the temp file. Use valid JSON escaping for all bodies and paths.

Default single-line comment shape:

```json
{
  "commit_id": "<sha>",
  "event": "COMMENT",
  "body": "<preamble>",
  "comments": [
    { "path": "path/to/file.go", "line": 42, "body": "..." }
  ]
}
```

For a range comment, include the caller-provided range:

```json
{
  "path": "path/to/file.go",
  "start_line": 40,
  "line": 42,
  "body": "..."
}
```

If the target GitHub API requires side fields for line-based comments, use `side: "RIGHT"` and `start_side: "RIGHT"` for comments on added or context lines. Do not use the deprecated `position` path unless the line-based payload fails and the user explicitly agrees to a fallback.

Set `event`:

- `COMMENT` by default.
- `REQUEST_CHANGES` only if a finding is `critical` or `high` and the caller opted into a blocking review.

## Publish

Submit one grouped review:

```sh
gh api -X POST "repos/$owner/$repo/pulls/$number/reviews" \
  --input "$tmpfile" \
  --jq '.html_url'
```

Print the returned `html_url` to the user.

## 422 Retry

If GitHub returns HTTP 422:

1. Fetch a fresh SHA with `gh pr view "$number" --repo "$owner/$repo" --json commits --jq '.commits[-1].oid // empty'`.
2. Replace `commit_id` in the temp payload.
3. Retry the same `gh api` call once.
4. If it still fails, stop and surface the API error plus the comment anchors that were submitted. Call out likely causes: stale commit, a line outside the diff, a range crossing hunks, or a comment on a deleted line.

Do not loop on 422.

## Boundaries

- Do not generate findings.
- Do not edit code.
- Do not resolve threads.
- Do not reply to existing review threads.
- Do not submit an empty review.
- Do not bypass preview confirmation unless the caller explicitly requested auto-confirm.
