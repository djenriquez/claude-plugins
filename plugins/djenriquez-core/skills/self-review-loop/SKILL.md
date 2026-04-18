---
name: self-review-loop
description: "Iterative self-review loop for PRs. Launches a fresh, context-free sub-agent each turn to run a code review skill against the PR, then evaluates and applies feedback. Loops until only minor/nit feedback remains or 5 turns complete. Auto-discovers the available code review skill — prefers the official code-review plugin, falls back to abatilo-core:code-review."
argument-hint: "#N or N (PR number)"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Bash(npm:*)
  - Bash(npx:*)
  - Bash(make:*)
  - Bash(pytest:*)
  - Bash(go:*)
  - Bash(cargo:*)
  - Bash(bundle:*)
  - Bash(dotnet:*)
  - Bash(mvn:*)
  - Bash(gradle:*)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
  - Skill
  - AskUserQuestion
  - ToolSearch
mcpServers:
  - codex
  - gemini-cli
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

Before doing anything else, determine which code review skill is available. Check for skill files on disk rather than spawning agents — this is lightweight and avoids the cost of executing the skill just to test availability.

**Attempt 1 — Official `code-review` plugin** (from `claude-code-marketplace`):

Use `Glob` to search for the skill file:

```
Glob(pattern: "**/skills/code-review/SKILL.md", path: "~/.claude/plugins")
```

If a match is found, set `review_skill` to `code-review` and proceed to Step 1c.

**Attempt 2 — `abatilo-core:code-review` plugin** (fallback):

If Attempt 1 found no match, search for the namespaced variant:

```
Glob(pattern: "**/abatilo-core/*/skills/code-review/SKILL.md", path: "~/.claude/plugins")
```

If a match is found, set `review_skill` to `abatilo-core:code-review` and proceed to Step 1c.

**Neither available — stop:**

If both attempts found no match, stop immediately and inform the user:

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
- `files_changed_per_turn`: empty map of turn → set of files changed — used for oscillation detection
- `cleanliness_findings_per_turn`: empty map of turn → list of {pattern, file, action, summary} — records every finding from the cleanliness pass
- `cleanliness_iterations_per_turn`: empty map of turn → integer — how many rounds the cleanliness pass took this turn

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

> **Trust assumption**: The sub-agent uses `bypassPermissions` to avoid dozens of permission prompts across multiple turns and nested agent spawns. This means the sub-agent — and any agents it spawns — run without user approval for each tool call. This is safe because code review skills only read code (Glob, Grep, Read, git diff) and send messages between their own agents. They do not edit files, push code, or make external calls. The orchestrator itself (this skill) is the one that edits files and pushes — it runs under the skill's own `allowed-tools` list, NOT under `bypassPermissions`. If the upstream code review skill changes to include destructive operations, this trust boundary would need revisiting.

### 2b. Capture the review output

When the sub-agent returns, capture its full output. This contains the structured review with findings organized by priority tier (Critical, High, Medium, Low) and a verdict (APPROVE or REQUEST CHANGES).

### 2c. Evaluate the stop condition

Parse the review output and check if the loop should stop:

**Stop condition — only non-actionable feedback remains:**
A review qualifies as "non-actionable" if ALL of the following are true:
- The verdict is **APPROVE**
- There are **zero** findings in the Critical or High tiers
- All remaining findings are classified as `suggestion`, `nitpick`, `thought`, `risk`, or `question` (none of these require code changes — `risk` is an acknowledged trade-off and `question` is a request for clarification, not a code fix)

**Stop condition — max turns reached:**
- `turn` equals `max_turns` (5)

If either stop condition is met, set `stop_reason` to `"clean_review"` or `"max_turns"` respectively and proceed to Step 3.

**Stop condition — oscillation detected:**
After turn 2, check `files_changed_per_turn` for thrashing. If the set of files changed in the current turn's triage (Step 2d) overlaps significantly (>50%) with the files changed two turns ago, the loop is oscillating — reviewers are undoing each other's changes. Set `stop_reason` to `"oscillation"` and proceed to Step 3. When reporting, note which files were thrashing and the conflicting feedback.

If no stop condition is met, continue to 2d.

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

Before writing any code this turn, load `references/cleanliness-standards.md` (find via `Glob(pattern: "**/skills/self-review-loop/references/cleanliness-standards.md", path: "~/.claude/plugins")`). Internalize the three patterns the code you write must not violate:

- **No duplication** — when three or more call sites share the same shape, extract a helper rather than copying the block
- **Return early** — use guard clauses so the happy path stays at the outermost level of indentation, not buried four `if`s deep
- **Atomic functions** — one nameable responsibility per function, roughly screen-sized; split anything that does "X and Y and Z"

Getting these right up front saves iterations of the cleanliness pass in Step 2f.

For each finding you are addressing:

1. Read the referenced file
2. Make the code change using `Edit`
3. Verify the change makes sense in context
4. Self-check against the three patterns above — if the new code violates one, fix it now rather than waiting for Step 2f to flag it

### 2f. Cleanliness pass (blocking)

If Step 2e changed no files this turn, skip this step and proceed to Step 2g.

The orchestrator just wrote code. That code must not introduce duplication, deep nesting, or long functions — the three patterns defined in `references/cleanliness-standards.md`. A dedicated fresh agent reviews only the diff produced this turn and surfaces violations. Unlike the main code review, these findings are **blocking**: they are fixed in the same turn, not triaged away.

**Capture the turn's diff:**

```
git diff
```

This shows the uncommitted working-tree changes — everything Step 2e wrote. Reviewing this narrow diff ensures the agent flags only code this skill introduced, not pre-existing patterns in surrounding context.

**Spawn the cleanliness agent** (fresh context, no knowledge of prior turns):

```
Agent(
  description: "Cleanliness pass turn N",
  prompt: "Review ONLY the diff below for violations of the three patterns in references/cleanliness-standards.md (find via Glob pattern **/skills/self-review-loop/references/cleanliness-standards.md under ~/.claude/plugins): duplication, deep nesting, long functions. Ignore everything else — no general readability, style, naming, or taste comments. Do not flag pre-existing code visible in surrounding context; flag only what this diff introduced or materially changed.\n\nDIFF:\n<paste git diff output here>\n\nReturn findings using the output format specified at the end of cleanliness-standards.md. If the diff is clean, return 'No findings'.",
  mode: "bypassPermissions"
)
```

**Apply findings:**

Every finding must be addressed unless applying it would:

- Introduce a regression (the fix is objectively incompatible with the code's correctness)
- Contradict a review finding already applied this turn or in a previous turn (resolve by picking the objectively better shape and record the conflict)
- Require changes outside the scope of the PR

Skipping for any other reason is not permitted here. "It reads fine" and "this is a nit" are not valid justifications — the cleanliness pass only flags patterns that are blocking by design. When a finding is skipped, record the specific reason under `cleanliness_findings_per_turn` with action `skipped`.

For each addressed finding: read the file, apply the Edit, move on. Record action `addressed` with a one-line summary.

**Re-run with an iteration cap:**

Cleanliness fixes sometimes introduce fresh cleanliness issues (an extracted helper grows too long, a flattened block exposes duplication). Re-run the cleanliness agent against the new diff until it returns "No findings" or `max_cleanliness_iterations` (3) is reached.

If the cap is hit with findings still outstanding, record them under `cleanliness_findings_per_turn` with action `skipped` and reason `"hit cleanliness iteration cap"`, then proceed to Step 2g. Hitting this cap repeatedly across turns is a signal that the orchestrator's fix style is fighting the standards — inspect the diff manually rather than looping further.

Increment `cleanliness_iterations_per_turn[turn]` with each round.

### 2g. Verify changes

After applying all changes for this turn, run the project's test suite and/or linter if one exists. Detect the test runner by checking for common patterns:

- `package.json` with a `test` script → `npm test` or equivalent
- `Makefile` with a `test` target → `make test`
- `pytest.ini`, `pyproject.toml`, or `setup.cfg` with pytest config → `pytest`
- `go.mod` → `go test ./...`
- `Cargo.toml` → `cargo test`
- `Gemfile` with rspec → `bundle exec rspec`
- `*.csproj` or `*.sln` → `dotnet test`
- `pom.xml` → `mvn test`
- `build.gradle` or `build.gradle.kts` → `gradle test`
- `.github/workflows/` CI config → inspect for the test command used in CI

If a test runner is found, run it. If tests fail:
1. Examine the failure and determine if it was caused by changes made in this turn
2. If yes, fix the issue before proceeding — this counts as part of the same turn's changes
3. If the failure is pre-existing (also fails on the PR's base branch), note it in the changelog but proceed

If no test runner is detected, skip this step and note "no test suite detected" in the turn summary.

### 2h. Commit and push

If any files were changed (across Step 2e and/or Step 2f):

```
git add <file1> <file2> ...
```

```
git commit -m "Address code review feedback (turn N)

Review feedback:
- <summary of change 1>
- <summary of change 2>

Cleanliness pass:
- <summary of cleanliness fix 1>
- <summary of cleanliness fix 2>
..."
```

Omit the "Cleanliness pass" section when the cleanliness pass produced no changes. A single commit per turn is the convention — do not split review-driven and cleanliness-driven edits into separate commits.

```
git push
```

If no files were changed (all findings skipped or minor-only, and cleanliness pass also had no findings), skip the commit.

### 2i. Update the changelog

Append this turn's results to the changelog and skipped lists. Record:
- Turn number
- Number of findings in each tier (from the main review)
- What was addressed from the main review (with file references)
- What was skipped from the main review (with reasons)
- Cleanliness pass activity: iterations taken, findings surfaced, each with action (addressed or skipped-with-reason)
- Commit SHA (if a commit was made)
- Update `files_changed_per_turn[turn]` with the set of files modified this turn (union of review and cleanliness edits)

### 2j. Increment and continue

Increment `turn` by 1 and go back to Step 2a.

---

## Step 3: MCP Cross-Model Debate (conditional)

After the review loop completes, stress-test the final state of the PR with external models. This catches issues that the Claude Code reviewer may have consistently missed across all turns, or changes that were incorrectly skipped.

**Skip this step if no MCPs are available.**

### 3a. Discover and execute debates

Read `protocols/mcp-debate.md` (find via `Glob(pattern: "**/protocols/mcp-debate.md", path: "~/.claude/plugins")`). Follow the discovery and execution instructions. If no MCPs are available, skip to Step 4.

### 3b. Gather context and debate prompt

Collect the material the MCPs need:

```
gh pr diff <N>
```

Construct the debate prompt with:

> You are performing a final code review of a PR that has already been through multiple rounds of automated review and fixes. Your job is adversarial: find what the reviewer consistently missed, identify changes that were incorrectly skipped, and surface any regressions introduced by the fixes themselves.
>
> ## PR Diff
> <full current diff>
>
> ## Last Review Verdict
> <verdict and findings from the final review turn>
>
> ## Changes Applied Across All Turns
> <changelog summary>
>
> ## Feedback Skipped Across All Turns
> <all skipped items with reasons>
>
> ## Challenge Questions
> 1. What bugs, logic errors, or correctness issues remain in the diff that the reviewer never caught?
> 2. Which skipped findings were actually worth addressing — was the skip justification wrong?
> 3. Did any of the fixes introduce new issues (regressions, inconsistencies, subtle behavior changes)?
> 4. Are there cross-cutting concerns (error handling patterns, naming consistency, test coverage) that no single-turn reviewer would catch?
> 5. Is the code ready to merge, or are there remaining issues that warrant another fix?

### 3c. Triage and apply MCP feedback

Evaluate each point using the same triage criteria from Step 2d:

- **Address** if it identifies a real bug, logic error, correctness issue, or a skipped finding that was genuinely worth fixing
- **Skip** if it's subjective, out-of-scope, or based on a misunderstanding of the code

For findings you address:
1. Read the file, make the change via `Edit`
2. Run tests if a test runner was detected earlier (Step 2g)
3. If any files were changed, commit and push:

```
git add <files>
git commit -m "Address MCP cross-model review feedback

- <summary of change 1>
- <summary of change 2>
..."
git push
```

Record all MCP-sourced changes and skips in the changelog under a "Cross-Model Debate" section.

## Step 4: Final Summary

After the loop terminates, present a comprehensive summary to the user.

```
## Self-Review Complete: PR #<N>

**Turns completed**: <turn count>
**Stop reason**: <"Clean review — only non-actionable feedback remaining" or "Maximum turns (5) reached" or "Oscillation detected — turns were undoing each other's changes">

### Turn-by-Turn Summary

#### Turn 1
- **Verdict**: <APPROVE/REQUEST CHANGES>
- **Findings**: <X Critical, Y High, Z Medium, W Low>
- **Addressed**: <count>
- **Skipped**: <count>
- **Cleanliness pass**: <N findings across M iterations; K addressed, L skipped> (or "skipped — no Step 2e changes")
- **Commit**: <SHA> (or "no changes")

#### Turn 2
...

### All Changes Applied

- [file:line] — <what was changed> (turn N)
- ...

### All Feedback Skipped

- <finding summary> — <why it was skipped> (turn N)
- ...

### All Cleanliness Fixes

- [pattern] [file:line] — <what was changed> (turn N)
- ...

### Cleanliness Findings Skipped

- [pattern] [file:line] — <specific reason, e.g. "conflicts with review finding from turn 1" or "hit cleanliness iteration cap"> (turn N)
- ...

### Cross-Model Debate (if conducted)

- **Models consulted**: [Codex, Gemini, both, or "skipped — no MCPs available"]
- **Findings surfaced**: <count>
- **Addressed**: <count> — <brief summary>
- **Skipped**: <count> — <brief summary>
- **Commit**: <SHA> (or "no changes")

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
- If this happens repeatedly on the same files, the oscillation detector (Step 2c) will catch it and break the loop

### Safety

- Never force-push
- Never modify files outside the scope of the PR's changes unless a reviewer explicitly requests it and the change is safe
- If a requested change seems risky (could break tests, change public API behavior), skip it and record why
- If applying a fix introduces a new issue you notice, fix that too in the same turn

### Commit hygiene

- One commit per turn (not per finding)
- Commit messages reference the turn number for traceability
- Each commit should be independently meaningful
