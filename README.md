# claude-plugins

Claude Code plugins by [@djenriquez](https://github.com/djenriquez).

## Installation

```
/plugin marketplace add djenriquez/claude-plugins
/plugin install djenriquez-core
```

## Skills

### /spec-review

Multi-agent spec review that catches ambiguity, missing edge cases, architectural infeasibility, API design gaps, operational blindspots, and scope risks — before a single line of code is written.

```
/spec-review path/to/spec.md
/spec-review #42                   # GitHub issue or PR (auto-detected)
/spec-review https://docs.google.com/...
/spec-review staged
/spec-review                       # uses conversation context
```

The skill spawns a team of specialist reviewers, dynamically selected based on what the spec covers:

| Specialist | Focus |
|------------|-------|
| clarity-reviewer | Ambiguity, contradictions, undefined terms, testable acceptance criteria |
| completeness-reviewer | Missing edge cases, error behavior, NFRs, state transitions |
| product-reviewer | Goal alignment, user value, success criteria, scope-to-value ratio |
| feasibility-reviewer | Technical feasibility, architectural fit, hidden complexity |
| api-reviewer | API surface, backward compat, protobuf conventions, idempotency |
| operations-reviewer | Failure modes, observability, rollback, SLO impact, on-call burden |
| scope-reviewer | Incremental delivery, dependency risks, timeline, scope creep |

Review rigor scales with risk:

- **L0 (Minor)**: Typo fixes, small clarifications — clarity + completeness only
- **L1 (Significant)**: New features, API additions — dynamic agent selection, self-critique, cross-review
- **L2 (Strategic)**: Architecture changes, new services — full review with all relevant specialists

Three phases: parallel specialist review → lead-mediated cross-review → deduplicated synthesis with binary verdict (APPROVED / REVISIONS NEEDED).

### /issue-to-spec

Orchestrates the full investigation-to-spec workflow starting from a GitHub issue — explores the issue and codebase, interviews the user, authors a spec, assesses complexity, and conditionally launches `/spec-review` to harden it.

```
/issue-to-spec #42
/issue-to-spec 42
```

### /complexity-check

Cross-model constructive challenge to catch unnecessary complexity in specs and PRs before peer review. Uses Codex MCP (preferred) or a subagent fallback for adversarial stress-testing.

```
/complexity-check path/to/spec.md
/complexity-check #42
/complexity-check staged
```

### /handle-pr-feedback

Reads unresolved review comments on a GitHub PR, triages each one, makes code changes, pushes a commit, replies to every comment with the action taken, and resolves each thread.

```
/handle-pr-feedback #42
/handle-pr-feedback 42
```

1. Checks out the PR branch and fetches unresolved review threads via the GitHub GraphQL API
2. For each thread, analyzes the comment and decides whether to **address** (make a code change) or **skip** (with explanation)
3. Commits and pushes all changes in a single commit
4. Replies to each comment thread with the action taken or reason for skipping
5. Resolves every thread

### /self-review-loop

Iterative self-improvement loop for PRs. Launches a fresh, context-free sub-agent each turn to run `/code-review` (from `abatilo-core`), then evaluates and applies the feedback. Loops until only minor/nit feedback remains or 5 turns complete.

```
/self-review-loop #42
/self-review-loop 42
```

1. Spawns a fresh sub-agent with no prior context to run `/code-review` against the PR
2. Parses the review output and triages each finding (address or skip)
3. Applies changes, commits, and pushes
4. Tears down the review agent and its spawned team
5. Repeats with a new fresh agent until the review comes back clean or 5 turns are reached
6. Reports a full changelog of all changes across all turns

Requires the `abatilo-core` plugin (provides `/code-review`).

## Acknowledgments

The spec-review skill's multi-agent architecture (three-phase orchestration, specialist agents, risk lanes, cross-review) is adapted from [@abatilo](https://github.com/abatilo)'s [`abatilo-core` code-review skill](https://github.com/abatilo/vimrc).

## License

MIT
