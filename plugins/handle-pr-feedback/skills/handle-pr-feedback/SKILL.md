---
name: handle-pr-feedback
description: "Reads unresolved review comments on a GitHub PR, triages each one (address or skip), makes code changes, pushes a commit, replies to every comment with the action taken or reason for skipping, and resolves each thread."
argument-hint: "#N or N (PR number)"
disable-model-invocation: true
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - WebSearch
  - WebFetch
---

# Handle PR Feedback

You are an autonomous agent that processes unresolved review comments on a GitHub pull request. You read every comment, decide whether to address or skip it, make code changes, push them, reply to each comment explaining what you did (or why you skipped), and resolve every thread.

The target PR is: $ARGUMENTS

If $ARGUMENTS is empty, ask the user which PR to work on.

---

## Step 1: Parse the PR Reference

`$ARGUMENTS` should be a PR number. Accepted formats:

- **`#N`** or **`N`**: e.g., `#42` or `42`
- **GitHub PR URL**: e.g., `https://github.com/owner/repo/pull/42` — extract the PR number from the URL path

Any other format is not supported. If the argument doesn't match these patterns, ask the user to provide a PR number.

---

## Step 2: Fetch PR Context

### 2a. Retrieve the PR

```
gh pr view <N>
```

Note the PR title, body, base branch, head branch, and current status. Confirm the PR is open — if it is merged or closed, inform the user and stop.

### 2b. Check out the PR branch

Ensure you are on the correct branch for this PR:

```
gh pr checkout <N>
```

Then pull to make sure you have the latest:

```
git pull
```

### 2c. Understand the PR's changes

Get the diff to understand what this PR changes:

```
gh pr diff <N>
```

Read the key files touched by the PR to build context about the changes.

---

## Step 3: Fetch Unresolved Review Comments

### 3a. Fetch all review comments

Use the GitHub API to retrieve review comments on the PR:

```
gh api repos/{owner}/{repo}/pulls/<N>/comments --paginate
```

### 3b. Filter to unresolved comments

From the fetched comments, identify **unresolved** comments. A review comment thread is unresolved if it has NOT been resolved/minimized by GitHub's thread resolution.

Use the GraphQL API to get thread resolution status:

```
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
' -f owner='{owner}' -f repo='{repo}' -F pr=<N>
```

Filter to threads where `isResolved` is `false`. These are the threads you need to process.

If there are zero unresolved threads, inform the user that all feedback has been addressed and stop.

### 3c. Build a comment inventory

For each unresolved thread, extract:

- **Thread GraphQL ID**: The `id` field on the `reviewThread` node (needed for resolution)
- **Comment body**: The review comment text (use the first comment in the thread as the primary feedback; subsequent comments are discussion context)
- **File path**: The file the comment is on
- **Line number**: The line in the diff the comment refers to
- **Diff hunk**: The surrounding code context
- **Author**: Who left the comment
- **Discussion**: Any follow-up replies in the thread

Present the inventory to the user as a numbered list:

```
Found N unresolved review thread(s):

1. [file:line] @author — "first ~80 chars of comment..."
2. [file:line] @author — "first ~80 chars of comment..."
...
```

---

## Step 4: Triage and Address Each Comment

Process each unresolved thread one at a time. For each thread:

### 4a. Analyze the comment

Read the full comment, its discussion thread, the referenced file, and the surrounding code. Understand:

- **What is being requested?** A code change, a question, a style preference, a bug fix, a design concern?
- **Is it actionable?** Can you make a concrete code change to address it?
- **Is it correct?** Does the feedback identify a real issue?

### 4b. Decide: Address or Skip

**Address** the comment if:
- It identifies a real bug, logic error, or correctness issue
- It requests a reasonable code improvement (naming, structure, readability)
- It asks for missing error handling, validation, or edge case coverage
- It points out a style/convention violation consistent with the codebase
- It requests documentation, comments, or type annotations that add value
- It is a question you can answer by improving the code or adding a clarifying comment

**Skip** the comment if:
- It is a subjective style preference with no clear codebase convention backing it
- Addressing it would require a large architectural change beyond the PR's scope
- The comment is based on a misunderstanding of the code (explain in your reply)
- It conflicts with another reviewer's feedback (note the conflict in your reply)
- The suggested change would introduce a regression or break existing behavior
- It has already been addressed by a previous change in this session

### 4c. Make the change (if addressing)

If addressing the comment:

1. Read the referenced file
2. Make the code change using `Edit`
3. Verify the change makes sense in context — read surrounding code if needed
4. Track the change for the commit message

### 4d. Record the action

For each thread, record:
- **Action**: `addressed` or `skipped`
- **Summary**: 1-2 sentence description of what you did or why you skipped
- **Files changed**: List of files modified (if addressed)

---

## Step 5: Commit and Push

After processing ALL comments:

### 5a. Check if any changes were made

```
git status
```

If no files were changed (all comments were skipped), skip to Step 6.

### 5b. Stage and commit

Stage only the files you modified:

```
git add <file1> <file2> ...
```

Write a clear commit message summarizing the feedback addressed:

```
git commit -m "Address PR review feedback

- <summary of change 1>
- <summary of change 2>
..."
```

### 5c. Push

```
git push
```

---

## Step 6: Reply to Each Comment and Resolve Threads

For each unresolved thread processed in Step 4, reply and resolve.

### 6a. Reply to the comment

Reply to the **first comment** in each thread (the original review comment) with a summary of the action taken.

For the reply, use the REST API. You need the `databaseId` of the first comment in the thread (the one you are replying to) and the `pull_number`:

**If addressed:**

```
gh api repos/{owner}/{repo}/pulls/<N>/comments -X POST \
  -f body='Addressed — <1-2 sentence description of the change made and why>' \
  -F in_reply_to=<comment_database_id>
```

**If skipped:**

```
gh api repos/{owner}/{repo}/pulls/<N>/comments -X POST \
  -f body='Skipped — <1-2 sentence explanation of why this was not addressed>' \
  -F in_reply_to=<comment_database_id>
```

### 6b. Resolve the thread

After replying, resolve the thread using the GraphQL API:

```
gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: { threadId: $threadId }) {
      thread { isResolved }
    }
  }
' -f threadId='<thread_graphql_id>'
```

The `threadId` is the GraphQL `id` from the `reviewThread` node fetched in Step 3b.

### 6c. Process all threads

Repeat 6a and 6b for every thread. Do all replies and resolutions — do not leave any thread unhandled.

---

## Step 7: Summary

Present a final summary to the user:

```
## PR Feedback Handled: #<N>

**Threads processed**: X
**Addressed**: Y
**Skipped**: Z

### Addressed
- [file:line] — <what was changed>
- ...

### Skipped
- [file:line] — <why it was skipped>
- ...

### Commit
<commit SHA> pushed to <branch>
```

If all comments were skipped (no commit), omit the Commit section and note that no code changes were needed.

---

## Guidelines

### Tone for replies

- Be concise and factual: "Fixed — renamed `foo` to `bar` for consistency with the rest of the module."
- When skipping, be respectful and specific: "Skipped — this would require restructuring the auth middleware, which is out of scope for this PR. Happy to address in a follow-up."
- Do not be defensive or dismissive
- Do not use filler phrases like "Great catch!" or "Thanks for the feedback!"

### Safety

- Never force-push
- Never modify files outside the scope of the PR's changes unless a comment explicitly requests it and the change is safe
- If a requested change seems risky (could break tests, change public API behavior, etc.), skip it and explain why in the reply
- If you are unsure whether a comment should be addressed, err toward addressing it — the reviewer asked for a reason

### Efficiency

- Read each file only once, even if multiple comments reference it
- Batch all changes before committing — one commit for all addressed feedback
- Process comments in file order to minimize context switching
