---
name: handle-pr-feedback
description: "Reads unresolved GitHub PR feedback, independently validates and groups it by owning seam, applies ranked remove/simplify or seam fixes for proven issues, pauses design-expanding or same-seam stacked changes, verifies the result, and replies with a reasoned disposition."
argument-hint: "#N or N (PR number)"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Skill
  - WebSearch
  - WebFetch
---

# Handle PR Feedback

Process every unresolved review thread, but optimize for minimum total
correctness risk and implementation complexity, not comment closure. Treat a
review comment as a claim or design request to evaluate, not implied
authorization to change code.

Every thread must receive a reasoned disposition. Leave threads that need a user
decision unresolved.

Target PR: `$ARGUMENTS`.

Load these resources from the installed `djenriquez-core` plugin root:

- `references/github-pr-workflow.md` for PR parsing, checkout, branch safety, and
  local diff rules
- `protocols/code-review-protocol.md` when validating defect claims
- `protocols/feedback-disposition.md` before triage or mutation
- `references/feedback-disposition-fixtures.md` when a disposition is ambiguous

## Set Up The PR

1. Resolve the target with `references/github-pr-workflow.md`. If no argument is
   provided, try the current branch's PR before asking the user.
2. Confirm that the PR is open, check out its head branch, pull, and fetch the
   base branch.
3. Stop if tracked files are already modified or the branch has diverged.
4. Record:

```sh
feedback_start_sha=$(git rev-parse HEAD)
pr_base_sha=$(git merge-base "origin/$baseRefName" HEAD)
```

5. Read the PR description, linked issue, changed-file inventory, relevant
   specifications or architecture decisions, and tests that define changed
   behavior. Review the local diff from `origin/<baseRefName>...HEAD`.

## Fetch Unresolved Threads

Resolve `owner` and `repo` from `gh repo view --json nameWithOwner`. Fetch review
threads with their resolution state:

```sh
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 50) {
              nodes {
                id
                databaseId
                body
                author { login }
                path
                line
                originalLine
                diffHunk
                createdAt
              }
            }
          }
        }
      }
    }
  }
' -f owner='<owner>' -f repo='<repo>' -F pr=<N>
```

Keep only threads where `isResolved` is `false`. For each thread, retain the
thread GraphQL ID, the first comment's database ID, the full discussion, path,
line, diff hunk, and author.

If no unresolved threads remain, report that result and stop.

## Cluster And Triage

Group threads by root cause and affected seam before deciding actions. Do not
process comments as independent code requests. Keep a mapping from every
original thread to its cluster.

For each cluster, apply `protocols/feedback-disposition.md` and record:

- evidence and invariant source
- impact and normalized severity
- owning seam
- ranked remedy (`remove/simplify`, then seam, then local)
- mechanisms added, widened, or removed
- `FIX NOW`, `NO CHANGE`, or `NEEDS DECISION`

Show one line for each `FIX NOW` and `NO CHANGE` cluster, including the remedy
rank. For `NEEDS DECISION`, show the full evidence, options, mechanism impact,
and recommendation.

If any cluster is `NEEDS DECISION`, present its decision packet and pause
mutation, reply, and resolve for that cluster and any cluster that shares its
owning seam, remedy, or files. Do not land more patches on a gated seam.
Continue with independent `FIX NOW` and conclusive `NO CHANGE` clusters on other
seams. Do not treat the round as complete until the user reclassifies every
gated cluster.

## Implement Ranked Fixes

Implement independent `FIX NOW` clusters by root cause. Rank remedies with
`protocols/feedback-disposition.md`: remove/simplify first, then fix at the
owning seam, then local patch only with a recorded why. Skip clusters paused
for a shared gated seam or remedy.

Add a test only when it asserts the affected load-bearing invariant at a stable
seam. Do not mirror incidental branches.

Record the files changed for each cluster and preserve the mapping to each
original thread.

## Verify And Recheck Complexity

Run focused verification for every fixed invariant, then run the broader
available suite in proportion to the risk. If no suite exists, record that fact.
Fix failures introduced by this work before continuing. Report pre-existing
failures with evidence.

Before committing, inspect both ranges:

```sh
git diff --numstat "$feedback_start_sha"
git diff --numstat "$pr_base_sha"
```

Follow `protocols/feedback-disposition.md` to report per-round and total PR
growth by category, plus mechanisms added, widened, and removed. If the actual
diff adds or widens a gated mechanism, stop before commit or push for that
cluster and reclassify it as `NEEDS DECISION`. If it is only large by the soft
size signal, report the growth and ask before commit. If mechanisms were added,
record the ranked-remedy justification or stop before calling the round clean.

## Commit And Push

If code changed:

1. Inspect `git status` and the complete diff.
2. Stage only the explicit files changed by this workflow.
3. Create one conventional commit that summarizes the addressed root causes.
4. Pull with rebase only when the branch remains safe and clean.
5. Push normally. Never force-push.

If every cluster is `NO CHANGE`, do not create an empty commit.

## Reply And Resolve

Reply to the first comment in every processed thread. Apply
`djenriquez-core:humanizer` in `pr-reply` mode to each reply before posting it.
Keep replies to one or two factual sentences and explain how the cluster
disposition resolves that specific thread.

Reply to the first comment with:

```sh
gh api repos/<owner>/<repo>/pulls/<N>/comments -X POST \
  -f body='<reply>' \
  -F in_reply_to=<comment_database_id>
```

Use these outcomes:

- `FIX NOW`: Reply only after the verified commit is on the branch, then resolve
  the thread.
- `NO CHANGE`: Reply with the conclusive evidence or scope reason, then resolve
  the thread. Independent `NO CHANGE` clusters may proceed even when another
  cluster is `NEEDS DECISION`.
- `NEEDS DECISION`: Do not reply or resolve the gated threads until the user
  decides. Leave them open while finishing independent clusters.

Resolve an eligible thread with its GraphQL ID:

```sh
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { isResolved }
    }
  }
' -f threadId='<thread_graphql_id>'
```

## Report The Result

Report:

- PR number, branch, and base
- cluster and thread counts for each disposition
- every thread-to-cluster mapping
- verification commands and results
- per-round and total PR change growth
- mechanisms added, widened, and removed
- commit and push status, when code changed
- any unresolved `NEEDS DECISION` threads

The terminal objective is a reasoned disposition for every thread, not zero
unresolved threads.

## Safety

- Never force-push.
- Never make an uncertain change merely because a reviewer requested it.
- Never claim a fix before the verified change is on the branch.
- Never resolve a thread that still needs a user decision.
- Never modify unrelated files or silently absorb pre-existing worktree changes.
