---
name: self-review-loop
description: "Iterative self-review loop for PRs. Launches a fresh, context-free sub-agent each turn to run a code review skill against the PR, then evaluates and applies feedback. Loops until only minor/nit feedback remains or 5 turns complete. Keeps per-turn commits local, squashes them into one final review commit, then pushes once. Auto-discovers the available code review skill — prefers the official code-review plugin, falls back to abatilo-core:code-review."
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

## Harness Adapter

This workflow is harness-agnostic. Use the local harness primitives that provide the same orchestration behavior:

- **Claude Code**: `Agent(...)` launches fresh sub-agents. `mode: "bypassPermissions"` is a Claude-specific convenience for read-only review sub-agents and nested review teams.
- **Codex**: Treat the user's invocation of `self-review-loop` as authorization to use Codex sub-agents for this loop. `Agent(...)` maps to `spawn_agent`. Use `fork_context: false` for the main review sub-agent so each review starts with no prior turn context. Use `agent_type: "default"` when the sub-agent needs to invoke the discovered `review_skill`; use `agent_type: "explorer"` for structural passes that only inspect a provided diff. Collect each sub-agent's final output with `wait_agent`. Codex tool execution follows the current Codex sandbox and approval behavior; do not require `bypassPermissions`.

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

Before doing anything else, determine which code review skill is available. Use the current harness's skill discovery first (for example, registered slash skills or listed Codex skills). If discovery is unavailable, check installed plugin roots on disk rather than spawning agents — this is lightweight and avoids the cost of executing the skill just to test availability.

**Attempt 1 — `code-review` skill**:

Use harness skill discovery or search installed plugin roots for the skill file:

```
**/skills/code-review/SKILL.md
```

If a match is found, set `review_skill` to `code-review` and proceed to Step 1c.

**Attempt 2 — `abatilo-core:code-review` plugin** (fallback):

If Attempt 1 found no match, search for the namespaced variant:

```
**/abatilo-core/**/skills/code-review/SKILL.md
```

If a match is found, set `review_skill` to `abatilo-core:code-review` and proceed to Step 1c.

**Neither available — stop:**

If both attempts found no match, stop immediately and inform the user:

```
/self-review-loop requires a code review skill, but none was found.

Install one of the following:
  Claude Code: a `code-review` plugin or `/plugin install abatilo-core`
  Codex: a Codex plugin/skill that provides code review, such as `abatilo-core:code-review`
```

### 1c. Fetch PR details

```
gh pr view <N> --json number,state,baseRefName,headRefName,title,body
```

Confirm the PR is open. If merged or closed, inform the user and stop. Capture the PR base branch and head branch from the PR details; later review turns need the local diff against the base branch because per-turn commits will not be pushed immediately.

### 1d. Check out the PR branch

```
gh pr checkout <N>
git pull
git fetch origin <pr_base_ref>
```

After the pull, record the commit at the start of the self-review work and the upstream branch:

```
git rev-parse HEAD
git rev-parse --abbrev-ref --symbolic-full-name @{u}
git branch --show-current
```

### 1e. Initialize the loop state

Set up tracking for the loop:

- `turn`: 1
- `max_turns`: 5
- `review_base_sha`: the `HEAD` SHA immediately after Step 1d's `git pull` — the base used when squashing local review commits
- `upstream_ref`: the branch's tracking ref from Step 1d, usually `origin/<branch>`
- `current_branch`: the checked-out PR branch from Step 1d
- `pr_base_ref`: the PR's base branch from Step 1c
- `pr_head_ref`: the PR's head branch from Step 1c
- `local_review_commits`: empty list — accumulates local-only commits created by this skill across all turns and MCP feedback
- `final_review_commit`: null — set after Step 4 creates the single squashed commit that is pushed
- `changelog`: empty list — accumulates ALL changes across ALL turns
- `all_skipped`: empty list — accumulates ALL skipped feedback across ALL turns
- `stop_reason`: null — will be set when the loop terminates
- `files_changed_per_turn`: empty map of turn → set of files changed — used for oscillation detection
- `code_health_notes`: empty list — accumulates advisory Go code-health observations that were useful but not required for this PR
- `structural_findings_per_turn`: empty map of turn → list of {pattern, path, severity, action, summary} — records every finding from the structural pass (both blocking and advisory)
- `structural_iterations_per_turn`: empty map of turn → integer — how many rounds the structural pass took this turn (0 if pass did not run)

---

## Step 2: The Review Loop

Repeat the following for each turn until a stop condition is met.

### 2a. Launch a fresh review sub-agent

**CRITICAL**: The sub-agent must have NO context from previous turns. This prevents bias — the reviewer should evaluate the code as-is, not relative to what it used to be. Each turn gets a completely fresh agent that knows nothing about prior feedback or changes.

Spawn the sub-agent, using the `review_skill` discovered in Step 1b.

Because per-turn commits are local until Step 4, the reviewer must review the checked-out local branch state, not the remote GitHub PR diff. Tell the sub-agent to use GitHub only for PR metadata and to use this local diff as the code under review:

```
git diff "origin/<pr_base_ref>"...HEAD
```

The PR number is metadata only for review turns. The review target is local `HEAD` against `origin/<pr_base_ref>`.

Claude Code:

```
Agent(
  description: "Code review turn N",
  prompt: "Run /<review_skill> against the checked-out local branch for PR #<N>. Use local HEAD against `origin/<pr_base_ref>` as the review target, not PR #<N>. Review the local diff from `git diff origin/<pr_base_ref>...HEAD`; do not use `gh pr diff <N>` as the diff source because self-review commits stay local until the final squash. Use `gh pr view <N>` only for PR metadata. Do not add any additional context or commentary — just run the skill and report back the full review output exactly as produced.",
  mode: "bypassPermissions"
)
```

Codex:

```
spawn_agent(
  agent_type: "default",
  fork_context: false,
  message: "Run <review_skill> against the checked-out local branch for PR #<N>. Use local HEAD against `origin/<pr_base_ref>` as the review target, not PR #<N>. Review the local diff from `git diff origin/<pr_base_ref>...HEAD`; do not use `gh pr diff <N>` as the diff source because self-review commits stay local until the final squash. Use `gh pr view <N>` only for PR metadata. Do not add any additional context or commentary — just run the skill and report back the full review output exactly as produced."
)
```

The sub-agent will invoke the code review skill, which may in turn spawn its own review team or sub-agents. The code review skill handles its own cleanup where the harness supports it, so when the sub-agent returns, any nested review team should already be complete along with the sub-agent itself.

> **Trust boundary**: Review sub-agents and any nested reviewer agents are expected to be read-only: they read code, inspect diffs, and exchange findings. They must not edit files, push code, or make destructive changes. In Claude Code, `bypassPermissions` is used only for those read-only review sub-agents to avoid repeated prompts. In Codex, sub-agents follow the current Codex sandbox and approval behavior. The orchestrator itself is the component that edits files, runs verification, creates local commits, squashes them, and pushes once at the end.

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

Before writing any Go code this turn, detect whether `go.mod` exists at the repo root. If it does, load `references/code-health-standards-go.md` from the installed `djenriquez-core` plugin root.

Use the code-health standard to shape the code you are already changing: prefer clear control flow, behavior-preserving slices, explicit error handling, clear goroutine lifetimes, consumer-side interfaces, and package extraction based on ownership rather than aesthetics.

The code-health standard is advisory, not a blocking gate. Do not rewrite unrelated working code solely to satisfy it. If you notice a worthwhile cleanup that is outside the current finding's scope, record it under `code_health_notes` as a follow-up suggestion instead of forcing it into this turn.

For each finding you are addressing:

1. Read the referenced file
2. Make the code change using `Edit`
3. Verify the change makes sense in context
4. For Go code, self-check touched code against `code-health-standards-go.md`; fix local issues when the fix is low-churn and directly improves the addressed finding, otherwise record an advisory note

### 2f. Structural pass (conditional)

This pass handles **inter-package shape**: responsibility, cohesion, public surface, layering, encapsulation. Run it when this turn's edits moved package boundaries — created or deleted directories, moved files between packages, introduced new top-level namespaces. For pure within-file edits, set `structural_iterations_per_turn[turn]` to 0 and proceed to Step 2g.

Spawn a fresh agent with the diff.

Claude Code:

```
Agent(
  description: "Structural pass turn N",
  prompt: "Review the diff below against references/structure-standards.md from the installed djenriquez-core plugin root. If go.mod exists at the repo root, also apply references/structure-standards-go.md and use references/code-health-standards-go.md as supporting advisory guidance for package extraction. Focus on inter-package shape only. Flag only what the diff introduced or materially changed, not pre-existing structure visible in context.\n\nLabel each finding's severity: blocking when it concerns a package the diff INTRODUCES (newly created), advisory when it concerns existing structure the diff modifies.\n\nDIFF:\n<paste git diff>\n\nNEW PACKAGES THIS TURN:\n<list or 'none'>\n\nUse the Structure Agent Output Format from structure-standards.md. Return 'No findings' if the structure is sound.",
  mode: "bypassPermissions"
)
```

Codex:

```
spawn_agent(
  agent_type: "explorer",
  fork_context: false,
  message: "Review the diff below against references/structure-standards.md from the installed djenriquez-core plugin root. If go.mod exists at the repo root, also apply references/structure-standards-go.md and use references/code-health-standards-go.md as supporting advisory guidance for package extraction. Focus on inter-package shape only. Flag only what the diff introduced or materially changed, not pre-existing structure visible in context.\n\nLabel each finding's severity: blocking when it concerns a package the diff INTRODUCES (newly created), advisory when it concerns existing structure the diff modifies.\n\nDIFF:\n<paste git diff>\n\nNEW PACKAGES THIS TURN:\n<list or 'none'>\n\nUse the Structure Agent Output Format from structure-standards.md. Return 'No findings' if the structure is sound."
)
```

**Blocking findings** must be addressed before proceeding, or skipped with a documented reason (regression risk, out of PR scope, conflicts with a prior review fix). **Advisory findings** are recorded for the turn summary as follow-up candidates and don't gate the loop.

If structural fixes change the diff, re-run the agent. Stop when findings stabilize, or after a few rounds — repeated thrash is a signal to inspect manually rather than keep iterating.

Record each finding under `structural_findings_per_turn[turn]` (pattern, path, severity, action). Increment `structural_iterations_per_turn[turn]` with each round.

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

### 2h. Commit locally

If any files were changed (across Step 2e and/or Step 2f):

```
git add <file1> <file2> ...
```

```
git commit -m "Address code review feedback (turn N)

Review feedback:
- <summary of change 1>
- <summary of change 2>

Structural pass:
- <summary of structural fix 1>
- <summary of structural fix 2>
..."
```

Omit the "Structural pass" section when it produced no changes (or did not run). A single local commit per turn is the convention — do not split review-driven and structural edits into separate commits.

Do **not** push here. These per-turn commits are local checkpoints only. Append the local commit SHA to `local_review_commits`; Step 4 will squash all local review commits into one final commit before pushing.

If no files were changed (all findings skipped or minor-only, and the structural pass also had no changes), skip the commit.

### 2i. Update the changelog

Append this turn's results to the changelog and skipped lists. Record:
- Turn number
- Number of findings in each tier (from the main review)
- What was addressed from the main review (with file references)
- What was skipped from the main review (with reasons)
- Structural pass activity: whether the pass ran, iterations taken, blocking findings (each addressed or skipped-with-reason), advisory findings (noted for follow-up)
- Code-health notes: advisory Go code-health observations recorded during this turn, if any
- Local commit SHA (if a commit was made)
- Update `files_changed_per_turn[turn]` with the set of files modified this turn (union of review and structural edits)

### 2j. Increment and continue

Increment `turn` by 1 and go back to Step 2a.

---

## Step 3: MCP Cross-Model Debate (conditional)

After the review loop completes, stress-test the final state of the PR with external models. This catches issues that the primary reviewer may have consistently missed across all turns, or changes that were incorrectly skipped.

**Skip this step if no MCPs are available.**

### 3a. Discover and execute debates

Read `protocols/mcp-debate.md` from the installed `djenriquez-core` plugin root. Follow the discovery and execution instructions. If no MCPs are available, skip to Step 4.

### 3b. Gather context and debate prompt

Collect the material the MCPs need:

```
gh pr view <N> --json number,state,baseRefName,headRefName,title,body
git fetch origin <pr_base_ref>
git diff "origin/<pr_base_ref>"...HEAD
```

Do not use `gh pr diff <N>` here; the remote PR will not include local self-review commits until Step 4 pushes the final squash commit.

If `go.mod` exists at the repo root, also load `references/code-health-standards-go.md` from the installed `djenriquez-core` plugin root and include it in the prompt as advisory review guidance. Code-health concerns should be framed as suggestions unless they identify concrete harm.

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
> ## Go Code-Health Standard (if applicable)
> <code-health-standards-go.md, advisory only>
>
> ## Challenge Questions
> 1. What bugs, logic errors, or correctness issues remain in the diff that the reviewer never caught?
> 2. Which skipped findings were actually worth addressing — was the skip justification wrong?
> 3. Did any of the fixes introduce new issues (regressions, inconsistencies, subtle behavior changes)?
> 4. Are there cross-cutting concerns (error handling patterns, naming consistency, test coverage, or advisory Go code-health issues) that no single-turn reviewer would catch?
> 5. Is the code ready to merge, or are there remaining issues that warrant another fix?

### 3c. Triage and apply MCP feedback

Evaluate each point using the same triage criteria from Step 2d:

- **Address** if it identifies a real bug, logic error, correctness issue, or a skipped finding that was genuinely worth fixing
- **Skip** if it's subjective, out-of-scope, or based on a misunderstanding of the code

For findings you address:
1. Read the file, make the change via `Edit`
2. Run tests if a test runner was detected earlier (Step 2g)
3. If any files were changed, commit locally:

```
git add <files>
git commit -m "Address MCP cross-model review feedback

- <summary of change 1>
- <summary of change 2>
..."
```

Do **not** push here. Append the local commit SHA to `local_review_commits`; Step 4 will include this commit in the final squash.

Record all MCP-sourced changes and skips in the changelog under a "Cross-Model Debate" section.

## Step 4: Squash Local Review Commits and Push Once

This is the only step that publishes self-review changes to the remote branch. Do not push before this step.

If `local_review_commits` is empty, skip the squash and push. There are no self-review changes to publish.

Before squashing, require a clean working tree:

```
git status --short
```

If the working tree is not clean, either commit the remaining self-review changes locally or fix the unexpected state before continuing.

Confirm the commit range to squash:

```
git log --oneline "$review_base_sha"..HEAD
```

This range must contain only commits created by this self-review-loop run. If it includes unrelated local or user commits, stop and ask before rewriting local history.

Use this non-interactive soft-reset squash instead of an interactive rebase. It rewrites only local commits that have not been pushed.

Squash all local review commits into one final review commit:

```
git reset --soft "$review_base_sha"
git commit -m "Address self-review feedback

Review loop:
- <summary of addressed review feedback across turns>

Structural pass:
- <summary of structural fixes, or omit this section>

Cross-model debate:
- <summary of MCP-sourced fixes, or omit this section>

Verification:
- <test/lint command and result, or no test suite detected>"
```

Record the preliminary squashed commit SHA:

```
git rev-parse HEAD
```

Set `final_review_commit` to this SHA.

Before pushing, rebase the final squashed commit onto the latest upstream branch if the remote changed while the loop was running:

```
git pull --rebase
```

If the rebase reports conflicts, resolve them, run the relevant tests again, and continue the rebase. If the rebase changes the commit SHA, rerun the relevant tests and refresh `final_review_commit` with `git rev-parse HEAD` before reporting. Never use `git push --force` or `git push --force-with-lease` for this workflow.

After the final commit is squashed and rebased if needed, push once:

```
git push
```

If the push is rejected because the remote has new commits, repeat the non-force path: pull with rebase, resolve conflicts if any, rerun relevant tests, then push again.

## Step 5: Final Summary

After the loop terminates and the final squash/push step completes, present a comprehensive summary to the user.

```
## Self-Review Complete: PR #<N>

**Turns completed**: <turn count>
**Stop reason**: <"Clean review — only non-actionable feedback remaining" or "Maximum turns (5) reached" or "Oscillation detected — turns were undoing each other's changes">
**Published commit**: <final_review_commit SHA> (or "no changes; nothing pushed")

### Turn-by-Turn Summary

#### Turn 1
- **Verdict**: <APPROVE/REQUEST CHANGES>
- **Findings**: <X Critical, Y High, Z Medium, W Low>
- **Addressed**: <count>
- **Skipped**: <count>
- **Structural pass**: <ran/skipped — N blocking findings, M advisory; K addressed, L skipped, P noted> (or "skipped — boundaries did not move")
- **Code-health notes**: <N advisory notes> (or "none")
- **Local commit**: <SHA, squashed before push> (or "no changes")

#### Turn 2
...

### All Changes Applied

- [file:line] — <what was changed> (turn N)
- ...

### All Feedback Skipped

- <finding summary> — <why it was skipped> (turn N)
- ...

### All Structural Fixes

- [pattern] [path/] — <what was changed> (turn N)
- ...

### Structural Concerns Noted (Advisory)

- [pattern] [path/] — <description of concern; candidate for follow-up PR> (turn N)
- ...

### Structural Findings Skipped

- [pattern] [path/] — <specific reason, e.g. "out of PR scope" or "stalled after a few rounds"> (turn N)
- ...

### Code-Health Notes

- [file:line] — <advisory Go code-health observation or follow-up suggestion> (turn N)
- ...

### Cross-Model Debate (if conducted)

- **Models consulted**: [model names, or "skipped — no MCPs available"]
- **Findings surfaced**: <count>
- **Addressed**: <count> — <brief summary>
- **Skipped**: <count> — <brief summary>
- **Local commit**: <SHA, included in final squash> (or "no changes")

### Final Squash and Push

- **Squashed commit**: <final_review_commit SHA> (or "not created — no changes")
- **Pushed**: <yes/no>
- **Remote handling**: <"normal push", "rebased onto updated upstream before push", or "not pushed — no changes">

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
- Never push unsquashed per-turn commits
- Never modify files outside the scope of the PR's changes unless a reviewer explicitly requests it and the change is safe
- If a requested change seems risky (could break tests, change public API behavior), skip it and record why
- If applying a fix introduces a new issue you notice, fix that too in the same turn
- If the remote branch changes during the loop, rebase the final squashed commit onto the latest upstream and push normally

### Commit hygiene

- Create one local commit per turn (not per finding) for checkpointing and traceability
- Commit messages for local turn commits reference the turn number
- Before publishing, squash every local self-review commit into one final review commit
- The remote branch should receive only the final squashed review commit from this workflow
