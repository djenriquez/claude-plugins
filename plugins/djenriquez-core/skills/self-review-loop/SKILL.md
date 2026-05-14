---
name: self-review-loop
description: "Iterative self-review loop for PRs. Launches a fresh, context-free sub-agent each turn to review the PR, then evaluates and applies feedback. Succeeds only when no unresolved Critical or High findings remain; the 10-turn limit and oscillation detection are bounded failure states. Keeps per-turn commits local, squashes them into one final commit only on success, then pushes once. Auto-discovers a compatible review execution mode — prefers a supported code-review skill and falls back to direct Codex review when nested team review is unavailable or unreliable."
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
  - claude
  - codex
  - gemini-cli
---

# Self-Review Loop

## Harness Adapter

This workflow is harness-agnostic. Use the local harness primitives that provide the same orchestration behavior:

- **Claude Code**: `Agent(...)` launches fresh sub-agents. `mode: "bypassPermissions"` is a Claude-specific convenience for read-only review sub-agents and nested review teams.
- **Codex**: Treat the user's invocation of `self-review-loop` as authorization to use Codex sub-agents for this loop. `Agent(...)` maps to `spawn_agent`. Use `fork_context: false` for the main review sub-agent so each review starts with no prior turn context. Select a `review_execution_mode` during setup: use `nested_skill_review` only when the discovered `review_skill` is capability-compatible with Codex execution, and use `direct_codex_review` when nested-team compatibility is absent or unproven. Use `agent_type: "default"` when a compatible skill must be invoked from the sub-agent; use `agent_type: "explorer"` or `default` for direct read-only review and for structural passes that only inspect a provided diff. Collect each sub-agent's final output with `wait_agent`. Codex tool execution follows the current Codex sandbox and approval behavior; do not require `bypassPermissions`.

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

### 1b. Pre-flight: discover the code review skill and execution mode

Before doing anything else, determine both:

- `review_skill`: the best available review skill, if any
- `review_execution_mode`: how review turns will run

Discovery by `SKILL.md` file existence is not enough to choose nested execution. It only proves a skill is installed; it does not prove the current harness can run that skill's required reviewer agents, team bookkeeping, or nested message flow. Use the current harness's skill discovery first (for example, registered slash skills or listed Codex skills). If discovery is unavailable, check installed plugin roots on disk rather than spawning agents — this is lightweight and avoids the cost of executing the skill just to test availability.

Supported `review_execution_mode` values:

- `nested_skill_review`: a fresh review sub-agent invokes `review_skill`, and that skill is allowed to run its own nested reviewer agents or team workflow.
- `direct_codex_review`: a fresh Codex sub-agent performs a direct code review from an explicit prompt and does not invoke `abatilo-core:code-review` or any nested team workflow.

**Attempt 1 — `code-review` skill**:

Use harness skill discovery or search installed plugin roots for the skill file:

```
**/skills/code-review/SKILL.md
```

If a match is found, set `review_skill` to `code-review`.

- Claude Code: set `review_execution_mode` to `nested_skill_review` when the skill is registered and the required agent/team tools are available.
- Codex: set `review_execution_mode` to `nested_skill_review` only if the skill is registered in the active Codex skills list or otherwise has a documented Codex-compatible execution path. If compatibility is not proven, keep `review_skill` for reporting but use `direct_codex_review`.

Record `review_mode_reason` with the specific evidence used for the mode decision, then proceed to Step 1c.

**Attempt 2 — `abatilo-core:code-review` plugin** (fallback):

If Attempt 1 found no match, search for the namespaced variant:

```
**/abatilo-core/**/skills/code-review/SKILL.md
```

If a match is found, set `review_skill` to `abatilo-core:code-review`, then run a compatibility check before allowing nested execution.

For `abatilo-core:code-review`, nested execution is compatible only when all of the following are true:

- The expected specialist reviewer capability is available, either as registered specialist agent types or as an installed `agents/` directory containing the required reviewer definitions.
- The active harness can spawn those specialists as read-only reviewers, or can include the `agents/<reviewer>.md` instructions in Codex `explorer` prompts.
- The active harness can complete the team/message lifecycle without relying on unavailable Claude-only tools.

Codex default: if `abatilo-core:code-review` is the only discovered review skill, or if any compatibility condition is absent or unproven, set `review_execution_mode` to `direct_codex_review`. Do not invoke `abatilo-core:code-review` from the review sub-agent in that case. Record the failed or skipped compatibility condition in `review_mode_reason`.

Only set `review_execution_mode` to `nested_skill_review` for `abatilo-core:code-review` when the compatibility check is explicitly satisfied. Then proceed to Step 1c.

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
- `review_base_sha`: the `HEAD` SHA immediately after Step 1d's `git pull` — the base used when squashing local review commits
- `upstream_ref`: the branch's tracking ref from Step 1d, usually `origin/<branch>`
- `current_branch`: the checked-out PR branch from Step 1d
- `pr_base_ref`: the PR's base branch from Step 1c
- `pr_head_ref`: the PR's head branch from Step 1c
- `changed_file_inventory`: output from `git diff --name-status "origin/<pr_base_ref>"...HEAD`
- `changed_file_count`: count from `git diff --name-only "origin/<pr_base_ref>"...HEAD`
- `changed_line_count`: additions plus deletions from `git diff --numstat "origin/<pr_base_ref>"...HEAD`, excluding binary `-` entries
- `large_pr`: true when `changed_file_count` is greater than 50 or `changed_line_count` is greater than 1000
- `max_turns`: 10 for every PR. `large_pr` still controls diff-prompt sizing, but it does not reduce the review loop turn budget.
- `review_skill`: the review skill discovered in Step 1b, or null if direct review is the only viable mode
- `review_execution_mode`: `nested_skill_review` or `direct_codex_review`, selected in Step 1b
- `review_mode_reason`: the concrete discovery/compatibility evidence that selected the mode
- `review_modes_per_turn`: empty map of turn → {mode, skill, reason} — records whether each turn used nested skill review or direct Codex review
- `review_attempt_timeout`: 10 minutes per review attempt
- `max_review_retries`: 1 for transport, timeout, null-output, invalid-output, or stream-disconnect failures
- `review_execution_telemetry`: empty map of turn → {mode, skill, duration, timeout, retry_count, fallback_reason}
- `mcp_availability`: result of Step 1f's one-time MCP preflight, recording available and unavailable providers
- `debate_attempt_policy`: `{max_attempts_per_provider: 1, provider_timeout: "5 minutes", failure_conditions: ["user-declined permission gate", "timeout", "transport error", "tool error", "null or empty output"], user_decline_message: "The user doesn't want to proceed with this tool use"}` — controls Step 3 execution after preflight availability is known
- `mcp_debate_execution_telemetry`: empty map of provider → {attempted, duration, timeout, rejected, error, output_received, status} — records Step 3 provider execution results
- `local_review_commits`: empty list — accumulates local-only commits created by this skill across all turns and MCP feedback
- `final_review_commit`: null — set after Step 4 creates the single squashed commit that is pushed
- `changelog`: empty list — accumulates ALL changes across ALL turns
- `all_skipped`: empty list — accumulates ALL skipped feedback across ALL turns
- `stop_reason`: null — will be set when the loop terminates
- `files_changed_per_turn`: empty map of turn → set of files changed — used for oscillation detection
- `code_health_notes`: empty list — accumulates advisory Go code-health observations that were useful but not required for this PR
- `structural_findings_per_turn`: empty map of turn → list of {pattern, path, severity, action, summary} — records every finding from the structural pass (both blocking and advisory)
- `structural_iterations_per_turn`: empty map of turn → integer — how many rounds the structural pass took this turn (0 if pass did not run)

### 1f. Pre-flight MCP availability once

Before entering the review loop, read `protocols/mcp-debate.md` from the installed `djenriquez-core` plugin root and follow its discovery rules once. Record only debate-capable external-model MCPs as available: a provider must expose a direct prompt endpoint for review feedback, not just a provider-named operational namespace.

Check already-loaded callable tools first, then use `ToolSearch` only as a fallback for deferred tools:

```
ToolSearch(query: "claude", max_results: 3)
ToolSearch(query: "codex", max_results: 3)
ToolSearch(query: "gemini", max_results: 3)
```

After each `ToolSearch` result, verify the returned schema exposes a debate-capable prompt tool before marking that provider available. `mcp__claude_code__` operational tools such as `Read`, `Bash`, or `Agent` do not count unless that namespace also exposes a direct external-model prompt endpoint.

When the active harness is Codex, prefer Claude for cross-model debate only when verified Claude debate tooling is available. Record the results in `mcp_availability`, including each provider's availability or unavailability, exact callable tool names, prompt/model arguments, and exposed model names. Later MCP debate steps must consult this recorded value instead of repeating discovery. If no debate-capable external-model provider is available, record `mcp_availability` as unavailable and skip the debate explicitly in Step 3 and the final summary.

Preflight availability means only "the provider exposes a callable debate tool." It does not guarantee execution will succeed later. Keep these failure modes distinct in the state and final summary:

- **Unavailable at preflight**: no verified debate-capable MCP tool was found. Step 3 is skipped before any debate prompt is built.
- **Rejected at execution**: the provider was available, but the harness/user declined the tool call. Treat the exact harness message `The user doesn't want to proceed with this tool use` as a terminal rejection for that provider and for this run's debate step.
- **Execution failed**: the provider call was accepted but timed out, returned a transport/tool error, or produced null/empty output. Mark only that provider failed and continue with remaining enrolled providers.

---

## Step 2: The Review Loop

Repeat the following for each turn until a stop condition is met.

### 2a. Launch a fresh review sub-agent

**CRITICAL**: The sub-agent must have NO context from previous turns. This prevents bias — the reviewer should evaluate the code as-is, not relative to what it used to be. Each turn gets a completely fresh agent that knows nothing about prior feedback or changes.

Spawn the sub-agent using the `review_execution_mode` selected in Step 1b.

Because per-turn commits are local until Step 4, the reviewer must review the checked-out local branch state, not the remote GitHub PR diff. Tell the sub-agent to use GitHub only for PR metadata and to use this local diff as the code under review:

```
git diff "origin/<pr_base_ref>"...HEAD
```

The PR number is metadata only for review turns. The review target is local `HEAD` against `origin/<pr_base_ref>`.

If `large_pr` is true, avoid duplicating a huge full diff into nested prompts. Give reviewers the `changed_file_inventory` and tell them to inspect targeted local diffs as needed:

```
git diff origin/<pr_base_ref>...HEAD -- <path>
```

For large PRs, nested prompts must not paste the full diff into every reviewer prompt. Direct review prompts may still ask the single fresh reviewer to inspect the local diff, but should prefer targeted file diffs when the inventory is large.

For `nested_skill_review`, the sub-agent invokes the compatible `review_skill`.

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

For `direct_codex_review`, do not invoke `abatilo-core:code-review` or any nested review-team workflow. Spawn exactly one fresh read-only reviewer with no prior context and give it a direct code-review prompt:

```
spawn_agent(
  agent_type: "explorer",
  fork_context: false,
  message: "Perform a direct code review of the checked-out local branch for PR #<N>. Use local HEAD against `origin/<pr_base_ref>` as the review target, not PR #<N>. Inspect the local diff from `git diff origin/<pr_base_ref>...HEAD`; use `gh pr view <N>` only for PR metadata. Do not edit files, push, commit, or spawn additional review teams. Return findings grouped by Critical, High, Medium, and Low, include file/line references where possible, and end with a verdict of APPROVE or REQUEST CHANGES."
)
```

Record `review_modes_per_turn[turn]` before waiting for the sub-agent. Include `mode`, `skill`, and `reason`, for example `{mode: "direct_codex_review", skill: "abatilo-core:code-review", reason: "Codex fallback because nested specialist capability was not proven"}`.

Wait at most `review_attempt_timeout` (10 minutes) for each review attempt. Treat any of these as review execution failures:

- timeout
- transport error
- null or empty completion
- invalid review output, such as missing priority tiers and missing verdict
- stream disconnected before completion

For those failures, retry once (`max_review_retries`: 1). If the retry also fails, do not start another nested review-team execution. Set `review_execution_mode` to `direct_codex_review` for the turn, record `fallback_reason`, and run the single direct reviewer prompt above. Record each attempt in `review_execution_telemetry[turn]` with mode, skill, duration, timeout status, retry count, and fallback reason.

When `nested_skill_review` is used, the sub-agent may invoke the compatible code review skill, which may in turn spawn its own review team or sub-agents. The code review skill handles its own cleanup where the harness supports it, so when the sub-agent returns, any nested review team should already be complete along with the sub-agent itself.

> **Trust boundary**: Review sub-agents and any nested reviewer agents are expected to be read-only: they read code, inspect diffs, and exchange findings. They must not edit files, push code, or make destructive changes. In Claude Code, `bypassPermissions` is used only for those read-only review sub-agents to avoid repeated prompts. In Codex, sub-agents follow the current Codex sandbox and approval behavior. The orchestrator itself is the component that edits files, runs verification, creates local commits, squashes them, and pushes once at the end.

### 2b. Capture the review output

When the sub-agent returns, capture its full output. This contains the structured review with findings organized by priority tier (Critical, High, Medium, Low) and a verdict (APPROVE or REQUEST CHANGES).

### 2c. Evaluate the stop condition

Parse the review output and check if the loop should stop:

First normalize severity using the orchestrator's judgment. Review every finding, including Medium, Low, `risk`, `question`, and untiered notes. If a finding describes a concrete correctness bug, security issue, data loss risk, regression, broken error path, or test failure that could materially affect users or maintainers, treat it as blocking even if the reviewer did not label it Critical or High. Do not build a numeric rubric; record the reclassification and reason in the turn summary.

**Successful stop condition — no unresolved Critical or High findings remain:**
The loop succeeds only when the latest fresh review reports **zero** findings in the Critical and High tiers and severity normalization leaves no blocking review feedback to address. Medium and Low findings do not keep the loop running by themselves unless triage determines they are blocking.

**Blocked stop condition — max turns reached:**
- `turn` equals `max_turns` (10)

If this happens while Critical or High findings remain unresolved, set `stop_reason` to `"blocked_max_turns"` and proceed directly to Step 5. Do not squash or push as a successful self-review result.

**Blocked stop condition — oscillation detected:**
After turn 2, check `files_changed_per_turn` for thrashing. If the set of files changed in the current turn's triage (Step 2d) overlaps significantly (>50%) with the files changed two turns ago, the loop is oscillating — reviewers are undoing each other's changes. Set `stop_reason` to `"blocked_oscillation"` and proceed directly to Step 5. Do not squash or push as a successful self-review result. When reporting, note which files were thrashing and the conflicting feedback.

If the successful stop condition is met, set `stop_reason` to `"no_unresolved_critical_high_findings"` and proceed to Step 3. If no stop condition is met, continue to 2d.

### 2d. Triage the feedback

For each finding in the review output, decide whether to **address** or **skip** it.

**Address** the finding if:
- It is in the Critical or High tier
- It was reclassified as blocking during severity normalization
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
- Review execution telemetry: mode, skill, duration, timeout status, retry count, and fallback reason if any
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

**Skip this step if no debate-capable external-model MCPs are available.**

### 3a. Confirm and execute debates

Read `protocols/mcp-debate.md` from the installed `djenriquez-core` plugin root. Follow the execution instructions for providers recorded as available in `mcp_availability`. Do not repeat `ToolSearch` here. When running in Codex and verified Claude debate tooling is available, run the Claude debate first; use Codex or Gemini only as additional providers or fallback providers according to the recorded preflight result. If `mcp_availability` shows no debate-capable external-model providers, skip to Step 4 and record "skipped — no debate-capable external-model MCPs available from Step 1f preflight" in the changelog and final summary.

Before building or sending any debate prompt, make exactly one user-facing checkpoint for the whole debate phase:

```text
About to run MCP cross-model debate against <N> provider(s): <provider list>. This may trigger external-model MCP tool calls. Proceed or skip the debate phase?
```

Use `AskUserQuestion` when the harness supports it; otherwise ask directly. Offer only two choices: run the debate phase or skip the debate phase. If the user skips or declines this checkpoint, skip to Step 4 and record "skipped — user declined MCP cross-model debate checkpoint" in the changelog and final summary. If the user approves, treat that as approval to attempt the enrolled provider calls for this run; do not ask again at the orchestrator level.

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

### 3c. Execute provider calls with bounded failure handling

Use `debate_attempt_policy` for every enrolled provider from `mcp_availability`:

- Make at most one MCP debate attempt per provider.
- Use a fixed 5 minute timeout per provider attempt. Debate prompts are smaller than full review turns, so do not inherit Step 2's 10 minute review timeout.
- Treat these as provider failures: harness/user rejection, timeout, transport error, tool error, stream disconnect, or null/empty output.
- If a provider fails, update that provider's entry in `mcp_availability` with `execution_status: "failed"` and an `execution_failure_reason`, then record the attempt in `mcp_debate_execution_telemetry`.
- Continue with the remaining enrolled providers after any provider failure.

Detect user rejection explicitly. If a tool call returns the exact message `The user doesn't want to proceed with this tool use`, set that provider's `execution_status` to `rejected`, record `rejected: true`, and do not retry that provider with a different model, reduced payload, or alternate prompt. The user has already declined execution for this run.

If all enrolled providers fail or are rejected, skip MCP-sourced triage, proceed directly to Step 4, and record "skipped — execution declined or unreachable" in the changelog and final summary. Do not prompt again and do not loop back to Step 3.

### 3d. Triage and apply MCP feedback

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

Record all MCP-sourced changes and skips in the changelog under a "Cross-Model Debate" section. Include provider execution telemetry for every enrolled provider, including successful providers, rejected providers, and failed providers.

## Step 4: Squash Local Review Commits and Push Once

This is the only step that publishes self-review changes to the remote branch. Do not push before this step.

Only run this step when `stop_reason` is `"no_unresolved_critical_high_findings"` and there are no unresolved Critical or High findings. If `stop_reason` is `"blocked_max_turns"` or `"blocked_oscillation"`, leave any local review commits unpushed and report the blocked state in Step 5 instead of publishing a successful result.

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

After the loop terminates and the final squash/push step completes or is skipped because the run is blocked, present a comprehensive summary to the user.

```
## Self-Review Result: PR #<N>

**Turns completed**: <turn count>
**Status**: <"Succeeded" or "Blocked">
**Stop reason**: <"No unresolved Critical or High findings remaining" or "Blocked — maximum turns reached with unresolved findings" or "Blocked — oscillation detected">
**Large PR mode**: <yes/no — changed_file_count files, changed_line_count changed lines, max_turns N>
**Review execution**: <nested_skill_review/direct_codex_review/mixed> — <retry/fallback summary>
**Published commit**: <final_review_commit SHA, "no changes; nothing pushed", or "not pushed — blocked">

### Turn-by-Turn Summary

#### Turn 1
- **Verdict**: <APPROVE/REQUEST CHANGES>
- **Findings**: <X Critical, Y High, Z Medium, W Low>
- **Review mode**: <nested_skill_review/direct_codex_review> using <review_skill or "direct prompt"> — <review_mode_reason>
- **Review execution**: <duration, timeout status, retry count, fallback reason if any>
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

- **Models consulted**: [Claude/Codex/Gemini model names, or "skipped — no debate-capable external-model MCPs available from Step 1f preflight", "skipped — user declined MCP cross-model debate checkpoint", or "skipped — execution declined or unreachable"]
- **Provider execution**: <per-provider status: success/rejected/failed/skipped, duration, timeout status, failure reason if any>
- **Findings surfaced**: <count>
- **Addressed**: <count> — <brief summary>
- **Skipped**: <count> — <brief summary>
- **Local commit**: <SHA, included in final squash> (or "no changes")

### Final Squash and Push

- **Squashed commit**: <final_review_commit SHA> (or "not created — no changes")
- **Pushed**: <yes/no>
- **Remote handling**: <"normal push", "rebased onto updated upstream before push", "not pushed — no changes", or "not pushed — blocked">

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
