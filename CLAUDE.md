# Repository Guidance

This repository packages agent workflow plugins for Claude Code and Codex. Keep instructions harness-aware: describe Claude-specific tool names only inside Claude adapter notes, and provide the Codex equivalent when a workflow depends on sub-agents, skill discovery, or plugin resources.

## Plugin Resource Paths

Shared protocols and references should be located relative to the installed `djenriquez-core` plugin root. Do not hard-code a single user cache path such as `~/.claude/plugins` or `~/.codex/plugins` as the only lookup method.

## Self-Review Loop Invariants

`plugins/djenriquez-core/skills/self-review-loop/SKILL.md` is meant to be a safety-critical orchestration skill. Preserve these invariants when editing it:

- Review turns use fresh, context-free, read-only reviewers against the local diff from `origin/<pr_base_ref>...HEAD`.
- Successful completion requires no unresolved Critical or High findings after severity normalization. Max turns, oscillation, and final-review failures are blocked states, not successful exits.
- Codex direct fallback may use one strong reviewer or multiple independent fresh reviewers based on PR size and risk, but must not invoke nested review teams when compatibility is unproven.
- Any MCP or cross-model code changes after the main loop require a final fresh review before squash/push.
- Per-turn commits stay local. Publish only the final squashed review commit, and never force-push from this workflow.

## Documentation Hygiene

When changing a skill, update public README wording only when user-facing behavior changes. Prefer concise invariant-based skill instructions over large state schemas or report templates unless the detail protects safety, portability, or reproducible verification.
