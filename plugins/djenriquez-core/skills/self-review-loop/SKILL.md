---
name: self-review-loop
description: "Iterative self-review loop for PRs. Launches a fresh, context-free sub-agent each turn to run a code review skill against the PR, then evaluates and applies feedback. Loops until only minor/nit feedback remains or 5 turns complete. Auto-discovers the available code review skill — prefers the official code-review plugin, falls back to abatilo-core:code-review."
argument-hint: "#N or N (PR number)"
disable-model-invocation: true
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Bash(npm:*)
  - Bash(npx:*)
  - Bash(make:*)
  - Bash(pytest:*)
  - Bash(go:*)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - Skill
---

# Self-Review Loop

You are an orchestrator that iteratively improves a PR by running fresh, unbiased code reviews and applying feedback. Each review is performed by a sub-agent with NO prior context — it sees only the PR diff, ensuring unbiased feedback with no anchoring to previous decisions.

The target PR is: $ARGUMENTS

If $ARGUMENTS is empty, ask the user which PR to work on.

---

## Step 1: Parse the PR Reference and Set Up

### 1a. Parse the PR number

`$ARGUMENTS` should be a PR number. Accepted formats:

- **`#N`** or **`N`**: e.g., `#42` or `42`
- **GitHub PR URL**: e.g., `https://github.com/owner/repo/pull/42` — extract the PR number from the URL path

Any other format is not supported. If the argument doesn't match these patterns, ask the user to provide a PR number.

### 1b. Pre-flight: discover the code review skill

Before doing anything else, determine which code review skill is available. Try them in order of preference:

**Attempt 1 — Official `code-review` plugin** (from `claude-code-marketplace`):

```
Agent(
  description: "Check code-review availability",
  prompt: "Run: /code-review\n\nIf the skill is recognized and starts executing (it will ask for arguments or begin reviewing), report back exactly 'AVAILABLE: code-review'. If the skill is not found or errors with 'unknown skill', report back exactly 'NOT AVAILABLE'.",
  mode: "bypassPermissions"
)
```

If the agent reports `AVAILABLE: code-review`, set `review_skill` to `code-review` and proceed to Step 1c.

**Attempt 2 — `abatilo-core:code-review` plugin** (fallback):

If Attempt 1 returned `NOT AVAILABLE`, try the namespaced variant:

```
Agent(
  description: "Check abatilo-core code-review",
  prompt: "Run: /abatilo-core:code-review\n\nIf the skill is recognized and starts executing (it will ask for arguments or begin reviewing), report back exactly 'AVAILABLE: abatilo-core:code-review'. If the skill is not found or errors with 'unknown skill', report back exactly 'NOT AVAILABLE'.",
  mode: "bypassPermissions"
)
```

If the agent reports `AVAILABLE: abatilo-core:code-review`, set `review_skill` to `abatilo-core:code-review` and proceed to Step 1c.

**Neither available — stop:**

If both attempts returned `NOT AVAILABLE`, stop immediately and inform the user:

```
/self-review-loop requires a code review skill, but none was found.

Install one of the following:
  claude plugin install code-review@claude-code-marketplace    (official)
  /plugin install abatilo-core                                 (community)
```

### 1c. Fetch PR details

```
gh pr view <N>
```

Confirm the PR is open. If merged or closed, inform the user and stop.

### 1d. Check out the PR branch

```
gh pr checkout <N>
git pull
```

### 1e. Initialize the loop state

Set up tracking for the loop:

- `turn`: 1
- `max_turns`: 5
- `changelog`: empty list — accumulates ALL changes across ALL turns
- `all_skipped`: empty list — accumulates ALL skipped feedback across ALL turns
- `stop_reason`: null — will be set when the loop terminates

---

## Step 2: The Review Loop

Repeat the following for each turn until a stop condition is met.

### 2a. Launch a fresh review sub-agent

**CRITICAL**: The sub-agent must have NO context from previous turns. This prevents bias — the reviewer should evaluate the code as-is, not relative to what it used to be. Each turn gets a completely fresh agent that knows nothing about prior feedback or changes.

Spawn the sub-agent, using the `review_skill` discovered in Step 1b:

```
Agent(
  description: "Code review turn N",
  prompt: "Run /<review_skill> against PR #<N>. Do not add any additional context or commentary — just run the skill and report back the full review output exactly as produced.",
  mode: "bypassPermissions"
)
```

The sub-agent will invoke the code review skill, which may in turn spawn its own agent team (via `TeamCreate`). The code review skill handles its own team cleanup, so when the sub-agent returns, any review team should already be torn down along with the sub-agent itself.

> **Trust assumption**: The sub-agent uses `bypassPermissions` to avoid dozens of permission prompts across multiple turns and nested agent spawns. This means the sub-agent — and any agents it spawns — run without user approval for each tool call. This is safe because code review skills only read code (Glob, Grep, Read, git diff) and send messages between their own agents. They do not edit files, push code, or make external calls. If the upstream code review skill changes to include destructive operations, this trust boundary would need revisiting.

### 2b. Capture the review output

When the sub-agent returns, capture its full output. This contains the structured review with findings organized by priority tier (Critical, High, Medium, Low) and a verdict (APPROVE or REQUEST CHANGES).

### 2c. Evaluate the stop condition

Parse the review output and check if the loop should stop:

**Stop condition — only minor feedback remains:**
A review qualifies as "minor-only" if ALL of the following are true:
- The verdict is **APPROVE**
- There are **zero** findings in the Critical or High tiers
- All remaining findings are classified as `suggestion`, `nitpick`, or `thought`

**Stop condition — max turns reached:**
- `turn` equals `max_turns` (5)

If either stop condition is met, set `stop_reason` to `"clean_review"` or `"max_turns"` respectively and proceed to Step 3.

If neither stop condition is met, continue to 2d.

### 2d. Triage the feedback

For each finding in the review output, decide whether to **address** or **skip** it.

**Address** the finding if:
- It is in the Critical or High tier
- It identifies a real bug, logic error, or correctness issue
- It requests reasonable error handling, validation, or edge case coverage
- It points out a style/convention violation consistent with the codebase
- It is a `blocker` or `risk` finding with a concrete harm scenario

**Skip** the finding if:
- It is a `nitpick` or `thought` with no impact on correctness
- It is a subjective style preference with no codebase convention backing it
- Addressing it would require architectural changes beyond the PR's scope
- The finding is based on a misunderstanding of the code
- The suggested change would introduce a regression or break existing behavior
- It conflicts with feedback from a previous turn that was already applied

For each finding, record:
- **Action**: `addressed` or `skipped`
- **Summary**: 1-2 sentence description of what you did or why you skipped
- **Files changed**: list of files modified (if addressed)
- **Turn**: current turn number

### 2e. Apply changes

For each finding you are addressing:

1. Read the referenced file
2. Make the code change using `Edit`
3. Verify the change makes sense in context

### 2f. Verify changes

After applying all changes for this turn, run the project's test suite and/or linter if one exists. Detect the test runner by checking for common patterns:

- `package.json` with a `test` script → `npm test` or equivalent
- `Makefile` with a `test` target → `make test`
- `pytest.ini`, `pyproject.toml`, or `setup.cfg` with pytest config → `pytest`
- `go.mod` → `go test ./...`
- `.github/workflows/` CI config → inspect for the test command used in CI

If a test runner is found, run it. If tests fail:
1. Examine the failure and determine if it was caused by changes made in this turn
2. If yes, fix the issue before proceeding — this counts as part of the same turn's changes
3. If the failure is pre-existing (also fails on the PR's base branch), note it in the changelog but proceed

If no test runner is detected, skip this step and note "no test suite detected" in the turn summary.

### 2g. Commit and push

If any files were changed:

```
git add <file1> <file2> ...
```

```
git commit -m "Address code review feedback (turn N)

- <summary of change 1>
- <summary of change 2>
..."
```

```
git push
```

If no files were changed (all findings skipped or minor-only), skip the commit.

### 2h. Update the changelog

Append this turn's results to the changelog and skipped lists. Record:
- Turn number
- Number of findings in each tier
- What was addressed (with file references)
- What was skipped (with reasons)
- Commit SHA (if a commit was made)

### 2i. Increment and continue

Increment `turn` by 1 and go back to Step 2a.

---

## Step 3: Final Summary

After the loop terminates, present a comprehensive summary to the user.

```
## Self-Review Complete: PR #<N>

**Turns completed**: <turn count>
**Stop reason**: <"Clean review — only minor feedback remaining" or "Maximum turns (5) reached">

### Turn-by-Turn Summary

#### Turn 1
- **Verdict**: <APPROVE/REQUEST CHANGES>
- **Findings**: <X Critical, Y High, Z Medium, W Low>
- **Addressed**: <count>
- **Skipped**: <count>
- **Commit**: <SHA> (or "no changes")

#### Turn 2
...

### All Changes Applied

- [file:line] — <what was changed> (turn N)
- ...

### All Feedback Skipped

- <finding summary> — <why it was skipped> (turn N)
- ...

### Final Review State

<Paste the verdict section from the last review>
```

---

## Guidelines

### Why fresh agents each turn

The core design principle: each review must be unbiased. If the reviewer knows what feedback was given last turn, it anchors on those findings and may miss new issues introduced by the fixes, or fail to notice that a previous concern was only partially addressed. A fresh agent sees the code with no history and evaluates it purely on its current state.

### Conflict resolution across turns

If a later turn's review gives feedback that contradicts a change made in an earlier turn:
- Do NOT revert the earlier change automatically
- Evaluate both positions and pick the one that is objectively better for the codebase
- Record the conflict and your reasoning in the skipped list

### Safety

- Never force-push
- Never modify files outside the scope of the PR's changes unless a reviewer explicitly requests it and the change is safe
- If a requested change seems risky (could break tests, change public API behavior), skip it and record why
- If applying a fix introduces a new issue you notice, fix that too in the same turn

### Commit hygiene

- One commit per turn (not per finding)
- Commit messages reference the turn number for traceability
- Each commit should be independently meaningful
