---
name: publish-review
description: "Publish existing code-review findings as one GitHub PR review with inline comments (required humanizer pass in review-comment mode). Use when the user says /publish-review, publish the review, leave these as PR comments, post this review on the PR, drop these in as inline comments, or comment on the PR with these findings. Not for generating review findings, replying to existing threads, handling feedback, or one-off conversational comments."
version: "0.1.5"
license: MIT
compatibility: "Portable Agent Skills format. Requires a POSIX shell, authenticated GitHub CLI, network access to GitHub, and read/write filesystem access for a temporary JSON payload."
dependencies:
  - "gh: GitHub CLI, authenticated with permission to write pull request reviews"
  - "POSIX shell"
  - "read/write filesystem access for a temporary JSON payload file"
allowed-tools: Bash(gh:*) Bash(git:*) Bash(command:*) Bash(rm:*) Bash(cat:*) Bash(test:*) Read Write Skill AskUserQuestion
---

# Publish Review

Publish already-written review findings as inline comments on a GitHub pull request. This skill does not perform code review. It only resolves the target PR, validates anchors, drafts a qualitative top-level review body, runs a required humanizer pass in `review-comment` mode on that body and every inline comment, and submits one grouped GitHub review. Invoking the skill is consent to publish — do not wait for a second confirmation before posting.

The default outcome is one `COMMENT` review so the author gets one notification. Use `REQUEST_CHANGES` only when at least one finding is `critical` or `high` and the caller explicitly opted into a blocking review.

## Inputs

Collect these before publishing:

- **PR reference**: `#N`, `N`, or a GitHub PR URL. Extract `owner`, `repo`, and PR number. If absent and the current directory is a clone with an open PR for the current branch, default from `gh pr view --json number,baseRepository`. Otherwise prompt.
- **Findings list**: each finding has `path`, `line`, `body`, and `severity`. Severity must be one of `critical`, `high`, `medium`, `low`, or `nit`. Accept `start_line` when the caller provides a range.
- **Optional blocking review**: a caller-supplied `--request-changes`, `blocking: true`, or equivalent host flag may set `event` to `REQUEST_CHANGES` when any finding is `critical` or `high`.
- **Optional closed-PR opt-in**: a caller-supplied `--include-closed`, `allow_closed: true`, or equivalent host flag is required before posting on a closed or merged PR.

If the findings list is empty, stop. Do not post an empty review.

## Main Review Body (required)

The GitHub review `body` is the main comment — a short qualitative summary for
someone skimming the notification. Details stay in the inline comments.

Draft it from the finding set (after anchor validation, before or during the
voice pass). Required humanizer pass applies to this body too.

Cover, in plain language (about 2–5 sentences):

- Overall read: how close this is to approve / merge-ready vs how much work
  remains (qualitative, not a fake score).
- What matters most: call out Critical/High themes by concern, not by dumping
  every path. Medium/Low/Nit can be rolled into "smaller cleanup" when that is
  the truth.
- Whether the open items look like focused fixes, a design rethink, or mostly
  nits.

Do not:

- Restate each inline finding verbatim.
- Invent severity, evidence, or work estimates the findings do not support.
- Use `#` headers or the `**Severity: label**` wrapper (that shape is for
  inline comments only).
- Default to filler like `A few thoughts on this.`

Good shape:

```text
Two High items on stale cache reuse need fixing before this is merge-ready;
the rest is Medium/Nit cleanup. Looks close if those land — details inline.
```

```text
No blockers from this pass. A few Medium notes and nits; nothing that should
hold the merge if you agree with the tradeoffs inline.
```

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

Do not post until this pass finishes for the main review body and every inline
finding body. Shipping the raw draft is a skill failure.

**Required:** apply `djenriquez-core:humanizer` in `review-comment` mode to:

1. The main review body (qualitative summary; no severity lead-in).
2. Each inline comment (mechanical `**Severity: label**` shape below).

- Default: read `skills/humanizer/SKILL.md` and
  `references/humanizer-patterns.md` from the plugin root, then run the
  humanizer Process **inline**. Do not skip if nested `/humanizer` is
  unavailable.
- Optional: Claude Code `/humanizer review-comment` only when nested skill
  invocation is known to work.
- Preserve technical claims and severity. Do not add findings. Do not soften a
  correctness bug into a vague suggestion. Do not invent evidence.

The target voice is a senior engineer typing into GitHub: brief, specific,
calm. Inline comments assume the reader has the hunk open — lead with the
defect, risk, or question, not a paraphrase of what the line already shows.

### Required inline comment shape

Every inline comment body must use this exact mechanical shape (no `#`
headers — they render too large in GitHub):

```text
**<Severity>: <short label>**

<body>
```

- `<Severity>` is exactly one of `Critical`, `High`, `Medium`, `Low`, or
  `Nit`, matching the finding's severity (`critical`/`high`/`medium`/`low`/
  `nit`).
- `<short label>` is a few words naming the issue (not a full sentence). Title
  case is fine; keep it skimmable.
- Put a blank line between the bold lead-in and the body.
- Strip any prior severity prefixes from the draft body before assembling this
  shape. Do not repeat severity inside the body prose.
- Humanizer rewrites the body (and may tighten the short label). It must keep
  this mechanical wrapper intact.

Rules for the body (also encoded in humanizer `review-comment` — apply all):

- Prefer 1–2 short sentences for most findings; 3 only when a tradeoff question
  needs room. Nits are often one sentence.
- Cut setup that restates visible behavior (`This adds X`, `This function now
  does Y`, `Here we check Z`). The anchor already shows that. Keep only what
  the reader would miss: failure mode, contract break, race, missing guard, or
  the decision you want them to confirm.
- Point at the mechanism, not the author. Say `This shifts the retained window
  on every eviction`, not `your code shifts...`.
- Wrap identifiers, APIs, fields, literals, and short logic fragments in inline
  backticks (`likeThis`, `retry_budget`, `status == 404`). Plain English for the
  prose around them; do not fence whole sentences as code.
- Say why it matters in concrete runtime, API, correctness, maintainability, or
  operator terms — without narrating the happy path first.
- For design tradeoffs, end with a real question. Good shape:
  `Conscious tradeoff, or worth a second look?`
- For nits, soften when appropriate with `Not worth doing speculatively` or
  `just flagging`.
- Reference other files, docs, or PR numbers only when the reader cannot see
  them from this anchor.
- No markdown headers (`#` / `##`) in inline comments. Avoid bullet lists
  unless naming multiple concrete locations.
- Avoid corporate openers (`I noticed`, `It would be a good idea to`,
  `Consider`, `Based on my analysis`, `Just wanted to flag`) and closing
  pleasantries.
- Avoid em dashes when commas, parentheses, or a separate sentence work.
- Do not pad criticism with generic praise.
- Avoid `PR`, `this PR`, or `your change` as the subject when a file, function,
  behavior, or line can be the subject.
- Strip AI jargon and significance inflation (`leverages`, `ensures`, `robust`,
  `comprehensive`, `it is important to note`).

Rewrite these anti-patterns:

- `This PR introduces X` / `This change adds X` / `This now does X` -> drop the
  restatement; start at the bug or risk
- `It might be worth considering X` -> `Worth a flag?` or `Worth a second look?`
- `I think we should X` -> state the position directly
- `The code does X. This is because Y.` -> `X, because Y.` (or just `Y` if X is
  visible in the hunk)
- Numbered or bulleted recommendations in one inline comment -> collapse to
  prose unless the list identifies multiple concrete locations
- Loose severity words mid-body (`This is Critical because…`) -> severity lives
  only in the bold lead-in

Bad (restates the work, missing severity lead-in):

```text
This adds a cache lookup before auth and keeps the old entry alive after the
key rotates, which is simpler on the fast path. The problem is a failed refresh
can still serve data for the previous tenant, so an auth miss can become a
cross-tenant read. Was that fallback intentional?
```

Good substantive shape:

```text
**High: Stale entry can cross tenants**

After key rotation, a failed refresh can still serve the previous tenant's
entry via `cache.Get`. Should stale reuse require a tenant match before
`reuseStale`?
```

Good nit shape:

```text
**Nit: Hardcoded timeout vs retry budget**

`timeout` is hardcoded while the outer `retry_budget` is configurable. Not
worth doing speculatively, but a flag would help if prod latency moves.
```

If a body still opens by describing what the hunk does, or lacks the bold
`**Severity: label**` lead-in, rewrite again before posting.

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

Print the returned `html_url` to the user. Optionally include a short posted
inventory (`owner/repo#number`, event, each `path:line` with severity) after
the URL — never as a gate before the API call.

## 422 Retry

If GitHub returns HTTP 422:

1. Fetch a fresh SHA with `gh pr view "$number" --repo "$owner/$repo" --json commits --jq '.commits[-1].oid // empty'`.
2. Replace `commit_id` in the temp payload.
3. Retry the same `gh api` call once.
4. If it still fails, stop and surface the API error plus the comment anchors that were submitted. Call out likely causes: stale commit, a line outside the diff, a range crossing hunks, or a comment on a deleted line.

Do not loop on 422.

## Boundaries

- Do not generate findings.
- Do not publish non-actionable Observations from `code-review` as inline findings unless the user explicitly promotes one after supplying actionable evidence and severity.
- Do not skip the humanizer voice pass, and do not post a raw main body or raw
  finding bodies.
- Do not post without a qualitative main review body.
- Do not edit code.
- Do not resolve threads.
- Do not reply to existing review threads.
- Do not submit an empty review.
- Do not wait for a second publish confirmation after the skill was invoked.
  Still pause for invalid-anchor choices and closed/merged PR opt-in.
