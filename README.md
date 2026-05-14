# djenriquez agent plugins

Agent workflow plugins by [@djenriquez](https://github.com/djenriquez), packaged for Claude Code and Codex.

## Installation

### Claude Code

```
/plugin marketplace add djenriquez/claude-plugins
/plugin install djenriquez-core
```

### Codex

Codex marketplace metadata lives at:

```
.agents/plugins/marketplace.json
```

The `djenriquez-core` entry points to:

```
./plugins/djenriquez-core
```

Install `djenriquez-core` from that Codex marketplace entry after this repository is available as a Codex plugin marketplace/source.

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
| complexity-reviewer | Premature abstractions, over-engineering, speculative generality, accidental complexity |

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

Iterative self-improvement loop for PRs. Launches a fresh, context-free sub-agent each turn to review the PR, then evaluates and applies the feedback. It succeeds only when no unresolved Critical or High findings remain; turn limits and oscillation detection are blocked states, not successful exits.

```
/self-review-loop #42
/self-review-loop 42
```

1. Selects a compatible review execution mode for the active harness
2. Spawns a fresh sub-agent with no prior context to review the PR
3. Parses the review output and triages each finding (address or skip)
4. Runs tests/linters to verify changes, then commits and pushes only after a successful no-unresolved-Critical/High review state
5. Bounds review-agent failures with a fixed wait and one retry before fallback
6. Uses file inventories and targeted local diffs for large PRs
7. Reports a full changelog, including review modes, retries, fallbacks, and MCP debate status

In Claude Code, the loop can use a compatible `code-review` plugin or `abatilo-core`. In Codex, it can use a direct fallback reviewer when nested review-team capabilities are unavailable or unreliable, so Codex users do not have to rely on nested `abatilo-core:code-review` execution as the default path. When a Claude MCP is available, Codex cross-model debate prefers Claude.

## Acknowledgments

The spec-review skill's multi-agent architecture (three-phase orchestration, specialist agents, risk lanes, cross-review) is adapted from [@abatilo](https://github.com/abatilo)'s [`abatilo-core` code-review skill](https://github.com/abatilo/vimrc).

## License

MIT
