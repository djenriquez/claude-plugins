---
name: full-dev-flow
description: "Runs the complete development workflow from session context to reviewed pull request: write a spec, run spec-review and revise the spec, create bits tasks, drain the bits implementation queue, commit, publish a PR, run self-review-loop, and post /assisted-review-heavy. Use when the user asks for the full dev flow, spec-to-PR workflow, plan/build/publish workflow, or wants an agent to carry a discussed feature through spec, implementation, PR publication, and automated review."
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Bash(bits:*)
  - Bash(jq:*)
  - Bash(mkdir:*)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Skill
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
  - ToolSearch
---

# Full Dev Flow

You are an orchestrator that turns the current session context into a finished pull request and then requests heavy assisted review.

The workflow target is: $ARGUMENTS

Use the current conversation as primary context. This skill is usually invoked after a design discussion or interview. If `$ARGUMENTS` is empty but the conversation contains a clear goal, proceed from that context. Ask only when you cannot write a concrete spec with testable acceptance criteria.

Your workflow:
1. Preflight the repo and choose the branch strategy
2. Persist a workflow checklist so the run can resume after interruptions
3. Write a standalone spec
4. Run spec-review and revise the spec
5. Run bits-plan against the final spec
6. Run bits-drain until implementation work is complete
7. Commit any remaining work
8. Run pr-publish with the right PR base
9. Run self-review-loop against the published PR
10. Post `/assisted-review-heavy` on the PR

---

## Harness Adapter

Invoke the underlying skills using the host's native mechanism:

- **Claude Code**: use slash commands such as `/write-spec`, `/spec-review`, `/bits-plan`, `/bits-drain`, `/pr-publish`, and `/self-review-loop` when available.
- **Codex**: invoke installed skills such as `djenriquez-core:write-spec`, `djenriquez-core:spec-review`, `bits:bits-plan`, `bits:bits-drain`, `djenriquez-core:pr-publish`, and `djenriquez-core:self-review-loop`. If direct skill invocation is not available, read the installed `SKILL.md` and follow it exactly.

Do not reimplement a sub-skill when the sub-skill is available. This skill coordinates ordering, branch strategy, state tracking, and handoffs between skills.

Sub-skills run with their own declared capabilities. This workflow's tool list does not limit the tools available inside those independent skill invocations.

---

## Step 1: Preflight and Branch Strategy

Discover current state before editing files:

```
git status --short --branch
git rev-parse --abbrev-ref HEAD
git remote show origin | grep "HEAD branch"
gh pr view --json number,state,baseRefName,headRefName,url
```

Treat `gh pr view` failure as "no PR for the current branch".

If tracked files are modified before the workflow starts and they are not clearly part of the current request, ask whether to include them. Never discard or overwrite user work.

Choose the branch strategy before writing the spec:

- **Update current PR** when the current branch already has an open PR and the requested work is a continuation of that same PR.
- **Create a stacked PR** when the requested work depends on an open current PR but is logically separate reviewable work. Create the child branch from the current PR head before implementation, record the parent head branch, and make the child PR target the parent head branch.
- **Branch from default** when the work is independent of the current branch or the current branch is the default branch.

If the branch base is ambiguous and the difference would affect review shape, ask one direct question. Otherwise use this rule: if the new work requires code that only exists on the current open PR branch, stack on that PR; if not, branch from the default branch.

For stacked work:

```
git checkout -b <child-branch>
git config branch.<child-branch>.gh-merge-base <parent-head-branch>
```

Record `branch_strategy`, `expected_pr_base`, `starting_branch`, and `working_branch` in the workflow checklist.

---

## Step 2: Persist the Workflow Checklist

Create durable orchestration tasks before starting long-running work. Prefer the host task system:

- **Codex**: use `update_plan`.
- **Claude Code**: use `TaskCreate` / `TaskUpdate`, `TodoWrite`, or the equivalent available task list.

Create one checklist item per workflow phase:

1. Write spec
2. Run spec-review and revise spec
3. Run bits-plan
4. Run bits-drain
5. Commit work
6. Publish PR
7. Run self-review-loop
8. Post `/assisted-review-heavy`

Keep the checklist updated as each phase starts and completes. Include durable state in checklist notes whenever possible: `spec_path`, `branch_strategy`, `expected_pr_base`, `bits_root_id`, `pr_number`, `pr_url`, and the last completed phase.

Do not use bits for orchestration checklist items by default. Bits is the implementation queue created by `bits-plan`. If the host has no other durable task system and you must use bits for workflow control, prefix every orchestration task with `[workflow]` and close all `[workflow]` tasks before invoking `bits-drain`, so `bits-drain` only sees implementation work.

On resume after an interruption, inspect the checklist and repo state, then continue from the first incomplete phase rather than restarting.

---

## Step 3: Write the Spec

**Primary path**: invoke the write-spec skill (`/write-spec` on Claude Code; on Codex, read the installed `djenriquez-core:write-spec` `SKILL.md` and follow it exactly). It owns the spec's location, structure, human-readability standards, and presenting the draft. The current session context is its primary source.

**Fallback**: if the write-spec skill is unavailable, load `references/spec-style.md` from the installed `djenriquez-core` plugin root and author `docs/specs/<filename>.md` directly following it.

Either way, the spec must be understandable without the original conversation, and acceptance criteria must be observable by command output, file inspection, or behavior.

Before moving on, ensure the spec has no unresolved open question that blocks implementation. Non-blocking open questions are acceptable only when clearly marked as deferred or out of scope.

---

## Step 4: Run Spec Review and Revise

Invoke spec review against the spec file:

```
/spec-review docs/specs/<filename>.md
```

Codex equivalent: invoke `djenriquez-core:spec-review` with the spec path.

When the review completes, triage every finding:

- **Critical and High**: address unless the finding is a false positive, contradicts the user's goal, or would expand scope beyond the intended feature. If skipped, record the reason in the workflow checklist and, when useful for future implementers, add a short consideration note in the relevant spec section.
- **Medium**: address when it improves implementability, acceptance criteria, rollout safety, or edge-case clarity. Skip when it is speculative or disproportionate.
- **Low, nitpick, thought**: address only when it is cheap and improves clarity. Ignore wording nits and preference-only feedback freely.
- **Questions**: answer them in the spec when they affect implementation. If a question reveals a real ambiguity, resolve it before continuing.

Revise the spec directly. The goal is a better spec, not a transcript of the review. Keep revisions within `references/spec-style.md`: route new implementer detail to the appendix, and keep the narrative layer's budgets and layering intact.

Run another spec-review pass only when there were Critical findings or the first pass returned `REVISIONS NEEDED`. Limit this loop to three review passes. Stop and ask the user if a valid Critical finding remains after three passes or cannot be resolved without a product decision.

When the spec is ready, change:

```markdown
**Status**: Ready
```

Record the final `spec_path` and spec-review verdict in the checklist.

---

## Step 5: Run Bits Plan

Invoke bits-plan against the final spec:

```
/bits-plan docs/specs/<filename>.md
```

Codex equivalent: invoke `bits:bits-plan` with the spec path and current conversation context.

Require `bits-plan` to create:

- A root "Verify goal:" task with a goal contract
- Self-contained implementation tasks
- Verification tasks wired as dependencies
- The CLAUDE.md documentation maintenance task required by `bits-plan`

After `bits-plan` completes, inspect the created bits and record the root verifier ID:

```
bits list --open --json | jq -r '.[] | select(.title | startswith("Verify goal:")) | [.id, .title] | @tsv'
```

If no root verifier exists, do not continue to implementation. Fix the plan or rerun `bits-plan`.

---

## Step 6: Drain Bits

Before invoking `bits-drain`, confirm no workflow-control bits are open:

```
bits list --open --json | jq -r '.[] | select(.title | startswith("[workflow]")) | [.id, .title] | @tsv'
```

If any `[workflow]` bits exist, close or otherwise resolve them before continuing.

Invoke bits-drain:

```
/bits-drain
```

Codex equivalent: invoke `bits:bits-drain`.

Let `bits-drain` continue until it reaches a terminal state. If it creates a Replan task, reports blocked dependencies, or requires user input, stop the full-dev-flow and report the blocking condition. Do not commit, publish, or request heavy review while implementation tasks are blocked.

After drain completes, verify no implementation work remains open:

```
bits list --open --json | jq -r 'length'
```

Proceed only when the open count is `0`.

---

## Step 7: Commit Work

Inspect the final working tree and commit history:

```
git status --short
git log --oneline <base>..HEAD
```

If files are modified or staged, create a commit before publishing. Prefer the installed commit skill (`/commit` in Claude Code or `abatilo-core:git-commit` in Codex) when available. If not available, make a conventional commit with a concise summary and body that mentions the spec and verification evidence.

If there are no working tree changes but there are commits for the work, continue. If there are no changes and no commits since the selected base, stop and report that there is nothing to publish.

Do not use `git add -A` when unrelated untracked files exist. Stage the files produced by this workflow explicitly.

---

## Step 8: Publish the PR

Before publishing, re-check the branch strategy:

- For a normal PR, the expected base is the default branch.
- For a stacked PR, the expected base is the parent PR head branch recorded in Step 1.
- For updating an existing PR, preserve that PR's current base unless the branch strategy says it is wrong.

For stacked PRs, make GitHub CLI default to the parent branch before invoking pr-publish:

```
git config branch.$(git branch --show-current).gh-merge-base <parent-head-branch>
```

Invoke pr-publish:

```
/pr-publish
```

Codex equivalent: invoke `djenriquez-core:pr-publish`. Include branch strategy context in the invocation notes, for example:

```
Stack this PR on <parent-head-branch>; expected base is <parent-head-branch>.
```

After pr-publish returns, capture the PR number and URL:

```
gh pr view --json number,url,baseRefName,headRefName,state
```

If the PR base does not match `expected_pr_base`, correct it if the host GitHub CLI supports base edits:

```
gh pr edit <number> --base <expected_pr_base>
gh pr view <number> --json baseRefName
```

If the base cannot be corrected automatically, stop and report the mismatch. Do not run self-review-loop on a PR targeting the wrong base.

---

## Step 9: Run Self-Review Loop

Invoke self-review-loop against the published PR:

```
/self-review-loop #<number>
```

Codex equivalent: invoke `djenriquez-core:self-review-loop` with the PR number.

Let the loop run to its terminal state. If it reports `Blocked`, stop and report the reason. Do not post `/assisted-review-heavy` until self-review-loop succeeds and pushes any final self-review changes.

After success, refresh PR state:

```
gh pr view <number> --json number,url,headRefOid,baseRefName,headRefName,state
git status --short
```

The working tree should be clean unless self-review-loop explicitly reported otherwise.

---

## Step 10: Trigger Heavy Assisted Review

Post the trigger comment only after self-review-loop succeeds:

```
gh pr comment <number> --body "/assisted-review-heavy"
```

Then verify the comment exists:

```
gh pr view <number> --json comments
```

Record in the checklist that heavy assisted review was requested.

---

## Final Summary

End with a compact audit trail:

- Spec path and final spec-review verdict
- Bits root verifier ID and drain result
- Branch strategy and PR base
- Commit(s) created by the workflow
- PR URL
- self-review-loop result
- Whether `/assisted-review-heavy` was posted
- Any skipped spec-review findings or self-review findings that matter

If the workflow stops early, report the exact phase, blocker, and the safest next command or skill to resume from.
