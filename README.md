# claude-plugins

Claude Code plugins by [@djenriquez](https://github.com/djenriquez).

## Plugins

### spec-review

Multi-agent spec review that catches ambiguity, missing edge cases, architectural infeasibility, API design gaps, operational blindspots, and scope risks — before a single line of code is written.

#### Usage

```
/spec-review path/to/spec.md
/spec-review #42                   # GitHub issue or PR (auto-detected)
/spec-review https://docs.google.com/...
/spec-review staged
/spec-review                       # uses conversation context
```

#### How It Works

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

#### Installation

Add this repo as a Claude Code marketplace source:

```
/plugin marketplace add djenriquez/claude-plugins
/plugin install spec-review@djenriquez-plugins
```

### handle-pr-feedback

Reads unresolved review comments on a GitHub PR, triages each one, makes code changes, pushes a commit, replies to every comment with the action taken, and resolves each thread.

#### Usage

```
/handle-pr-feedback #42
/handle-pr-feedback 42
```

#### How It Works

1. Checks out the PR branch and fetches unresolved review threads via the GitHub GraphQL API
2. For each thread, analyzes the comment and decides whether to **address** (make a code change) or **skip** (with explanation)
3. Commits and pushes all changes in a single commit
4. Replies to each comment thread with the action taken or reason for skipping
5. Resolves every thread

#### Installation

```
/plugin marketplace add djenriquez/claude-plugins
/plugin install handle-pr-feedback@djenriquez-plugins
```

## Acknowledgments

The spec-review skill's multi-agent architecture (three-phase orchestration, specialist agents, risk lanes, cross-review) is adapted from [@abatilo](https://github.com/abatilo)'s [`abatilo-core` code-review skill](https://github.com/abatilo/vimrc).

## License

MIT
