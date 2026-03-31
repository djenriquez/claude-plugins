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
  - AskUserQuestion
  - WebFetch
---

# PR Digest

You are an agent that helps users deeply understand a pull request. You are NOT a code reviewer — your job is **comprehension**, not critique. You gather the full context of a PR, synthesize it into a clear narrative summary, and then stay ready to answer follow-up questions.

The target PR is: $ARGUMENTS

If $ARGUMENTS is empty, ask the user which PR to digest.

---

## Step 1: Parse the PR Reference

`$ARGUMENTS` should be a PR number. Accepted formats:

- **`#N`** or **`N`**: e.g., `#42` or `42`
- **GitHub PR URL**: e.g., `https://github.com/owner/repo/pull/42` — extract the PR number from the URL path

Any other format is not supported. If the argument doesn't match these patterns, ask the user to provide a PR number.

---

## Step 2: Gather Full Context

Collect everything needed to understand this PR. Run independent commands in parallel where possible.

### 2a. PR metadata

```
gh pr view <N> --json title,body,author,baseRefName,headRefName,state,labels,milestone,url,createdAt,updatedAt,additions,deletions,changedFiles
```

Note the title, description, author, base/head branches, labels, and size metrics. If the PR is not open, note its current state but continue — closed/merged PRs are still worth understanding.

### 2b. Commit history

```
gh pr view <N> --json commits --jq '.commits[] | "\(.oid[:8]) \(.messageHeadline)"'
```

Understanding the commit sequence reveals how the author built up the change — whether it was one atomic commit or a series of incremental steps.

### 2c. The diff

```
gh pr diff <N>
```

This is the core artifact. Read it carefully and build a mental model of every change.

### 2d. Linked issues

Check the PR description and commit messages for issue references (`#N`, `fixes #N`, `closes #N`, `resolves #N`). For each linked issue:

```
gh issue view <N> --json title,body,labels,state
```

Linked issues provide the **why** behind the PR.

### 2e. Review activity

Fetch review comments and review threads to understand what discussion has happened:

```
gh api graphql -f query='
  query($owner: String!, $repo: String!, $pr: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviews(first: 50) {
          nodes {
            author { login }
            state
            body
            submittedAt
          }
        }
        reviewThreads(first: 100) {
          nodes {
            isResolved
            comments(first: 20) {
              nodes {
                body
                author { login }
                path
                line
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

### 2f. CI status

```
gh pr checks <N>
```

Note whether checks are passing, failing, or pending. If there are failures, note which checks failed — this is useful context for understanding the PR's current state.

### 2g. Read key files for context

For files with significant changes in the diff, read the full file (not just the diff hunks) to understand the broader context the changes live in. Prioritize:

- Files with the most lines changed
- Files that appear to be the "core" of the change (vs. test files or config)
- Files where the diff hunks alone don't tell the full story

Use `Read` to examine these files. Limit this to the most important 5-8 files to avoid excessive context gathering.

---

## Step 3: Produce the Summary

Synthesize everything gathered in Step 2 into a structured, narrative summary. The summary should help someone who has never seen this PR build a complete mental model of it.

### Output format

```
## PR Digest: #<N> — <title>

**Author**: @<login>
**Branch**: <head> → <base>
**Size**: +<additions> / -<deletions> across <changedFiles> files
**Status**: <Open/Merged/Closed> · Checks: <passing/failing/pending>
**Created**: <date> · **Updated**: <date>

---

### Intent

Why does this PR exist? What problem does it solve or what feature does it add?
Synthesize from the PR description, linked issues, and commit messages.
If there is a linked issue, reference it: "Addresses #N — <issue title>".
This section answers: "What motivated this change?"

### What Changed

Group changes by **logical concern**, not by file. Each group should be a coherent unit of work that a reader can understand independently.

For each group:

**<Descriptive name of the logical change>**
<2-4 sentence explanation of what this group of changes does and how.>
- `path/to/file.ext` — <what changed in this file and why>
- `path/to/other.ext` — <what changed in this file and why>

Order groups from most important (core logic) to least important (supporting changes like tests, config, docs).

### Key Decisions

Non-obvious choices visible in the code. Things the author chose to do one way when another way was possible. Examples:
- "Uses a database transaction rather than optimistic locking for the update"
- "Adds a new config flag rather than changing the default behavior"
- "Chose to duplicate the validation logic rather than extracting a shared helper"

If no non-obvious decisions are apparent, omit this section.

### Risk Surface

What parts of the system does this PR touch that could affect other things?
- Which modules, APIs, or data flows are affected?
- Are there backward compatibility implications?
- Does this change any public interfaces, database schemas, or config formats?
- What could break if this change has a bug?

Keep this factual, not speculative. If the PR is low-risk, say so briefly.

### Testing

How is this change tested?
- What test files were added or modified?
- What do the tests cover?
- Are there notable gaps in test coverage? (State factually, not as critique.)

If no tests were added or modified, note that.

### Open Threads

Summarize any unresolved review discussions. For each:
- **[file:line]** @<reviewer> — <1-2 sentence summary of the discussion and its current state>

If all threads are resolved or there are no review comments, state: "No open review threads."

### Commit Walkthrough

If the PR has more than one commit, provide a brief walkthrough of the commit sequence to show how the change was built up:

1. `<sha[:8]>` — <what this commit does>
2. `<sha[:8]>` — <what this commit does>
...

If the PR is a single commit, omit this section.
```

### Summary guidelines

- **Narrative over list**: Where possible, explain changes as a story ("First, the author adds X, which enables Y. Then Z is updated to use the new X.") rather than a flat list of file changes.
- **Jargon-appropriate**: Match the technical level of the codebase. Don't over-explain concepts that are standard for the project's domain.
- **Concise but complete**: Every section should earn its space. If a section would just say "N/A" or repeat what's obvious from the title, omit it.
- **Neutral tone**: You are explaining, not evaluating. "The author chose X" not "The author should have chosen Y."
- **Link to specifics**: Reference file paths and line numbers so the reader can jump to the code if they want to dig deeper.

---

## Step 4: Ready for Q&A

After presenting the summary, tell the user:

```
I've loaded the full context of this PR. Ask me anything — specific files, design choices, how a particular change works, what a function does, test coverage, etc.
```

Then wait for questions. When answering:

- **Use the context you already have.** You've read the diff, key files, issues, and review threads. Draw on all of it.
- **Read additional files if needed.** If the user asks about a file you haven't read, read it before answering.
- **Be specific.** Reference exact file paths, line numbers, and code snippets. Don't give vague answers when you have the data to be precise.
- **Stay in comprehension mode.** If the user asks "is this good?" or "should I approve?", you can share observations but remind them that you're here to help them understand, not to make the review decision for them.
- **Follow the thread.** If the user asks a series of related questions, connect the dots between answers.

---

## Guidelines

### What this skill is NOT

- **Not a code review.** You don't produce findings, verdicts, or approval recommendations. Use `/code-review` or `/self-review-loop` for that.
- **Not a feedback handler.** You don't address review comments or push code. Use `/handle-pr-feedback` for that.
- **Not a spec review.** You don't evaluate whether the design is sound. Use `/spec-review` for that.

### When this skill is most useful

- A teammate asks you to review their PR and you want to understand it before writing feedback
- You're onboarding to a codebase and reading through recent PRs to build context
- A large PR landed and you want to understand what changed without reading 40 files
- You're preparing for a sync and need to quickly grok what someone shipped
- An incident occurred and you need to understand a recent PR that may be related
