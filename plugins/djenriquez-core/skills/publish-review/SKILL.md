---
name: publish-review
description: "Publish existing code-review findings as one GitHub PR review with inline comments (required humanizer pass in review-comment mode). Use when the user says /publish-review, publish the review, leave these as PR comments, post this review on the PR, drop these in as inline comments, or comment on the PR with these findings. Not for generating review findings, replying to existing threads, handling feedback, or one-off conversational comments."
version: "0.1.6"
license: MIT
compatibility: "Portable Agent Skills format. Requires a POSIX shell, authenticated GitHub CLI, network access to GitHub, and read/write filesystem access for a temporary JSON payload."
dependencies:
  - "gh: GitHub CLI, authenticated with permission to write pull request reviews"
  - "POSIX shell"
  - "read/write filesystem access for a temporary JSON payload file"
allowed-tools: Bash(gh:*) Bash(git:*) Bash(command:*) Bash(rm:*) Bash(cat:*) Bash(test:*) Read Write Skill AskUserQuestion
---

# Publish Review

Publish already-written review findings as one GitHub PR review. This skill
does not perform code review. It resolves the PR, validates anchors, drafts
wording, runs a required humanizer pass, and posts. Invoking the skill is
consent to publish — do not wait for a second confirmation.

Default event is `COMMENT`. Use `REQUEST_CHANGES` only when a finding is
`critical` or `high` and the caller opted into a blocking review.

## Inputs

- **PR reference**: `#N`, `N`, or a GitHub PR URL. If absent, use the current
  branch's open PR via `gh pr view --json number,baseRepository`. Otherwise
  prompt.
- **Findings list**: `path`, `line`, `body`, `severity`
  (`critical`|`high`|`medium`|`low`|`nit`). Optional `start_line` for ranges.
- **Optional blocking review**: `--request-changes` / `blocking: true`.
- **Optional closed-PR opt-in**: `--include-closed` / `allow_closed: true`
  required before posting on a closed or merged PR.

Stop if the findings list is empty.

## Comment contracts

**Main review `body` (required):** short qualitative skim — how close to
approve, how much work remains, which themes matter. Details stay inline. No
finding dump, no filler preamble, no `**Severity:**` wrapper.

**Each inline comment:**

```text
**<Severity>: <short label>**

<body>
```

`Severity` is `Critical`|`High`|`Medium`|`Low`|`Nit` matching the finding.
Bold only — never `#` headers. Backtick code/logic refs in the body.

**Voice:** apply `djenriquez-core:humanizer` in `review-comment` mode to the
main body and every inline body before posting (inline Process by default;
nested `/humanizer` optional). Do not post raw drafts. Preserve claims and
severity; do not add findings or invent evidence.

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

Draft the main body and inline comments per **Comment contracts**, then run the
humanizer pass before building the payload.

## Build The Payload

Write a JSON object to the temp file. Use valid JSON escaping for all bodies and paths.

Default single-line comment shape:

```json
{
  "commit_id": "<sha>",
  "event": "COMMENT",
  "body": "<main review body summary>",
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
- Do not publish non-actionable Observations from `code-review` as inline
  findings unless the user explicitly promotes one with evidence and severity.
- Do not skip humanizer or post without the main review body.
- Do not edit code, resolve threads, or reply to existing threads.
- Do not submit an empty review.
- Do not wait for a second publish confirmation. Still pause for invalid
  anchors and closed/merged PR opt-in.
