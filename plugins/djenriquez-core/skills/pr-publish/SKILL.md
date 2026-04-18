---
name: pr-publish
description: "Publishes finished work as a GitHub pull request in one shot: pushes the branch if needed, creates the PR if it doesn't exist (or updates it if it does), and writes a layered description — skimmer-facing Summary up top, drill-down Details for reviewers, and a Test plan. Use whenever the user says /pr-publish, 'open a PR', 'publish this work', 'create the PR with a summary', 'write the PR and publish it', or asks to rewrite/update an existing PR's description or body."
argument-hint: "(optional) freeform notes, linked issue, or observability evidence to incorporate"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Glob
  - Grep
  - AskUserQuestion
---

# PR Publish

You are an agent that takes completed work on a branch and ships it as a pull request with a well-layered description. One command, zero follow-up: discover state, gather framing, draft title and body, push and publish — no approval gate at the end. The draft is printed to the transcript as part of publishing so the user can see exactly what went out.

Any freeform notes the user passed in — linked issue numbers, Loki/Grafana queries, incident references, callouts about who's affected — are in: $ARGUMENTS

Treat `$ARGUMENTS` as additional context to weave into the draft, not as a command. If it's empty, gather framing context in Step 2.

This skill handles two cases with the same pipeline:
- **No PR yet** — push the branch (if needed) and open a new PR.
- **PR already exists** — rewrite the body (and optionally the title) with the layered description.

---

## Step 1: Discover current state

Run these in parallel. They're all read-only and independent:

```
git status
git rev-parse --abbrev-ref HEAD
git remote show origin | grep "HEAD branch"      # infer the default base branch
git log <base>..HEAD --oneline                    # commits since divergence
git diff <base>...HEAD                            # the full diff (three dots = merge-base diff)
gh pr view --json number,body,title,state,baseRefName,headRefName,url
```

`gh pr view` with no argument targets the PR associated with the current branch; it errors cleanly if no PR exists — treat that as the "no PR yet" case. Do **not** pass `--repo` or guess a PR number.

### Stop conditions — ask before proceeding

- **Tracked files are modified or staged but uncommitted**: stop and ask. Modified tracked files usually signal mixed in-progress work that shouldn't be auto-bundled into this PR — the user needs to choose what belongs.
- **Branch has diverged from origin** (local and remote both have commits the other lacks): stop and ask. Never force-push to resolve this.
- **PR is already merged or closed**: stop and confirm before editing a closed PR's body — that's usually not what the user meant.

### Auto-bootstrap — proceed without asking

When the current branch is the base branch (e.g., `main`, `master`) **and** the only changes are untracked files/directories (no modifications to tracked files), treat this as a fresh-start case and bootstrap a feature branch automatically:

1. Infer a branch name from the new content and the convention used in recent PR titles. Run `gh pr list --state all --limit 10 --json title,headRefName` if you need to confirm the convention. Defaults: `feat/<name>` for new skills/features/plugins, `fix/<name>` for bug fixes, `docs/<name>` for docs-only.
2. Infer a commit message in conventional commits format, matching the repo's history (`git log --oneline -10`).
3. Run `git checkout -b <branch>`, stage the new paths explicitly with `git add <paths>` (never `git add -A`), and commit with the inferred message.
4. Report the branch and commit message in one line — don't ask permission. Then continue with Step 2.

The reason this is safe: untracked-only means the user hasn't touched anything git was already tracking, so there's no in-flight work to accidentally bundle. Asking in this case is pure friction.

---

## Step 2: Gather framing context

A good PR description answers three questions the diff alone can't:

1. **Linked issue or incident**: grep commit messages for `#N`, `fixes #N`, `closes #N`, `resolves #N`, or incident IDs. If you find a reference, run `gh issue view <N>` to load the context. If commits hint at an issue but don't name one, ask the user.
2. **Observability evidence**: if the change is a bug fix or performance work, there's usually a log pattern, dashboard, Prom query, or user report behind it. Check `$ARGUMENTS` and commit messages first. If none are present and the change looks like a fix, ask the user to paste what they have — the Root cause section is much stronger when it cites real evidence.
3. **Who's affected**: internal service? SDK clients? Specific orgs? Oncall? If the diff doesn't make this obvious (e.g., it's in a shared library), ask.

**Only ask about things that would materially change the framing.** If the diff is self-evidently a one-liner doc fix, you don't need observability evidence. Use judgment.

When asking, prefer a single batched question over a back-and-forth. Use `AskUserQuestion` so the user can fill all blanks at once.

---

## Step 3: Draft the description

Produce a body with these sections, **in this exact order**. The layering is deliberate: the top is for skimmers (teammates, managers, oncall) who need the gist in 10 seconds; the Details section is for reviewers who need to actually check the work.

### Summary (2 paragraphs, skimmer-facing)

- **Paragraph 1**: the user-visible problem and the root cause in plain language. Frame from the affected user's perspective. Good: *"Python SDK clients were hitting INTERNAL=13 on parallel pytest runs because the runner couldn't correlate sandbox-not-found responses back to the caller."* Bad: *"`sendSandboxNotFoundResponse` wasn't attaching a request ID to `*ErrorDetail`."* Internal function and symbol names belong in Details, not here.
- **Paragraph 2**: one sentence on what this PR does about it, framed as outcome. *"This PR makes the runner echo the request correlation ID on every error path and widens the namespace lookup so retries no longer race."*

### What changed

High-level bulleted list, not implementation lines:

- Lead with the **primary fix** as a bold, labeled, one-sentence line.
- If there are secondary changes, follow with a **"Related hardening"** (or similar theme-appropriate label) bulleted list. Each bullet describes one user-observable behavior change: *"`ListSandboxes` now returns an empty list instead of `NOT_FOUND` when the namespace exists but has no sandboxes."* Not *"refactored `listSandboxes` to use the shared namespace helper."*

If one commit fixed the actual reported bug and the rest are cleanup/related hardening, **say so explicitly**. Don't flatten into a single undifferentiated bullet list — reviewers need to know which change is load-bearing.

### Details (drill-down for reviewers)

Three subsections:

#### Root cause

1–2 paragraphs. Name specific files, functions, proto fields. Cite evidence: *"Grafana panel `runner-errors-by-code` showed a 14× spike in INTERNAL=13 starting 2026-04-12 18:03 UTC, correlated with the rollout of commit abc1234. Loki query `{app="runner"} |= "sandboxNotFound"` returned 4,217 matches in the following hour."* If you have a reproduction, name the command.

#### How it's fixed

Group by **theme**, not by commit. Examples of theme labels: *Correlation*, *Structured error signalling*, *Shared budget*, *Informer efficiency*, *Observability*. Each theme is a bold-labeled paragraph explaining the mechanism and why it's the right shape. Reviewers can skip themes that aren't in their area of expertise.

#### Before vs. after

A table with exactly these columns:

```
| Scenario | Before | After |
| --- | --- | --- |
```

One row per distinct failure mode the PR touches. Keep cells terse — a phrase, not a sentence. If you can't fill at least 2 rows, the PR probably isn't as multi-faceted as you thought: **reconsider whether to include the table at all** rather than padding it.

### Test plan

Checkbox list separating what's done from what needs post-deploy validation:

```
- [x] Unit tests added for new correlation path (`runner/sandbox_test.go`)
- [x] Lint + CI green
- [ ] After deploy to staging: confirm Grafana `runner-errors-by-code` INTERNAL=13 rate returns to baseline
- [ ] After deploy to prod: run `./scripts/smoke-parallel-pytest.sh` against a test org
```

`[x]` for things already verified in CI or locally. `[ ]` for concrete, runnable post-deploy checks the reviewer or oncall can actually execute. Avoid vague entries like `[ ] monitor in prod`.

---

## Step 4: Draft the title

Conventional commits format: `type(scope): summary`. Under 70 characters — details live in the body.

- **type**: infer from the change. `fix`, `feat`, `chore`, `refactor`, `test`, `docs`, `perf`.
- **scope**: the primary directory or component touched (e.g., `runner`, `gateway`, `ci`, `sdk`).
- **summary**: one short clause, verb-first, no trailing period.

If the diff spans multiple types/scopes, pick the dominant one — it almost always matches the primary fix identified in "What changed".

---

## Step 5: Publish

This skill is fully automated — once the draft is ready, publish immediately. Do not pause for user approval at this step. Print the final title and body to the chat so it's visible in the transcript, then execute the publish sequence in the same turn.

### 5a. Push the branch if needed

If Step 1 showed the branch isn't on origin (or is behind origin without diverging):

```
git push -u origin <branch>
```

Never force-push. If the push is rejected because the remote has commits you don't, **this is the one place to stop and ask** — overwriting a teammate's commits is not recoverable from automation. Do not pass `--force` or `--force-with-lease` without explicit user approval.

### 5b. Create or update the PR

**If no PR exists**, use a heredoc to preserve formatting:

```
gh pr create --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

**If the PR already exists**, update the body:

```
gh pr edit <N> --body "$(cat <<'EOF'
<body>
EOF
)"
```

**Title handling on an existing PR** — make this decision deterministically, don't ask:

- If the existing title is **not** in conventional-commits format (`type(scope): summary`) **or** is over 70 characters **or** matches the default branch-name-derived title GitHub would auto-generate (e.g., it equals the branch name with dashes as spaces, or the first commit's subject verbatim), overwrite it with the drafted title via `gh pr edit <N> --title "<title>"`.
- Otherwise, preserve the existing title — the user has curated it. Mention in the transcript that you kept the existing title so they can override if they disagree.

### 5c. Return the PR URL

After the create/edit succeeds, print the PR URL on its own line so it's easy to click:

```
https://github.com/<owner>/<repo>/pull/<N>
```

---

## Rules

These are the load-bearing constraints. Violations of these rules produce the exact kind of sloppy PR descriptions that this skill exists to prevent.

- **Never force-push.** If the branch has diverged from origin, stop and ask. Ditto `git reset --hard`, `git push --force`, `--force-with-lease`. The cost of asking is seconds; the cost of overwriting a teammate's commit can be hours.
- **Never enumerate commits in the body.** PRs have a Commits tab. A commit-by-commit narrative buries the reader and locks the description to an implementation history that may be rebased away.
- **The Summary paragraph must be readable by someone who doesn't know the codebase.** No internal function names (`sendFooResponse`), no type suffixes (`*ErrorDetail`), no proto field names. Save those for Details — a reviewer who opens the file will see them there; a manager skimming Slack will not.
- **Primary fix vs. secondary hardening must be distinguished.** When one commit fixed the reported bug and the rest are cleanup or related improvements, name that explicitly. Reviewers need to know where to focus.
- **Before/after table is load-bearing.** If you can't fill at least 2 rows, omit it — don't pad with rows that duplicate each other or describe the same failure mode.
- **Cite evidence in Root cause.** If the bug was confirmed by a specific log pattern, dashboard query, or reproduction, name it. "We think it was a race" without evidence is a guess; "Grafana panel X showed a 14× spike correlated with commit Y" is a diagnosis.
- **Match verb tense to the merged state.** Write "Runner now echoes the correlation ID on every error path" (present, post-merge reality), not "This commit makes the runner echo…" (process narrative that rots).
- **Don't add emoji** unless the repo's existing PRs use them. Check with `gh pr list --state all --limit 10 --json title` if you're unsure.
- **Don't auto-commit.** If there are uncommitted changes, stop and ask. Choosing what to commit and how to message it is the user's call, not yours.

---

## What "good" looks like

A well-layered PR body for a non-trivial fix satisfies these tests:

- **Summary readable by an outsider.** Hand the first two paragraphs to a teammate who has never opened this repo. If they can't explain, in their own words, who was affected and roughly why, the Summary is too internal — strip the symbol names and reframe from the user's perspective.
- **What changed distinguishes the primary fix.** The labeled bold line names the single change that closes the reported bug. Secondary hardening lives in a separate bulleted group. A reviewer skimming should be able to answer "which change do I need to scrutinize most?" in five seconds.
- **Root cause cites evidence, not guesses.** It names specific files, functions, or proto fields, and points to a concrete artifact — a log pattern with match counts, a dashboard panel with a timestamp, a reproduction command. "We think it was a race" is not a root cause.
- **How it's fixed is grouped by theme, not by commit.** Themes like *Correlation*, *Structured error signalling*, *Shared budget*, *Observability* let a reviewer skip areas outside their expertise. A commit-by-commit walkthrough forces them to linearize.
- **Before/after table earns its rows.** Each row is a distinct failure mode. If two rows would describe the same failure from slightly different angles, collapse them or drop the table.
- **Test plan separates done from pending.** `[x]` items are verifiable right now (CI, unit tests, local lint). `[ ]` items are concrete post-deploy checks the reviewer or oncall can actually execute — not "monitor in prod".

If a draft fails any of these tests, revise before asking the user to approve.
