# Repository Guidance

This repository packages agent workflow plugins for Claude Code and Codex. Keep instructions harness-aware: describe Claude-specific tool names only inside Claude adapter notes, and provide the Codex equivalent when a workflow depends on sub-agents, skill discovery, or plugin resources.

## Plugin Resource Paths

Shared protocols and references should be located relative to the installed `djenriquez-core` plugin root. Do not hard-code a single user cache path such as `~/.claude/plugins` or `~/.codex/plugins` as the only lookup method.

## Prompt Architecture

Keep `SKILL.md` files as concise default-path orchestrators. Put detailed mechanics in `protocols/` or `references/` and load them only when that branch of the workflow is reached.

- Use `protocols/` for shared execution contracts such as review output, finding qualification, and MCP debate.
- Use `references/` for reusable guidance such as PR mechanics, harness adapters, and style guidance.
- Do not duplicate large protocol blocks inside specialist agents. Agent files should describe specialist judgment only.
- Do not paste large diffs or specs into every sub-agent prompt when a file path, changed-file inventory, and targeted read commands will work.

## Lean Review Policy

Code review should be staged by risk:

- L0: one concise generalist review, no specialist fan-out, no debate.
- L1: generalist first, then only evidence-triggered specialists.
- L2: bounded specialists with explicit selection criteria.

External debate is an escalation tool for uncertain high-severity findings, specialist disagreement, or judgment-sensitive L2 verdicts. It is not a default per-agent ritual.

## Self-Review Loop Invariants

`plugins/djenriquez-core/skills/self-review-loop/SKILL.md` is meant to be a safety-critical orchestration skill. Preserve these invariants when editing it:

- Review turns use fresh, context-free, read-only reviewers against the local diff from `origin/<pr_base_ref>...HEAD`.
- Successful completion requires no unresolved Critical or High findings after severity normalization. Max turns, oscillation, and final-review failures are blocked states, not successful exits.
- Prefer the local lean `djenriquez-core:code-review` path when available. Direct fallback must follow the same staged L0/L1/L2 policy.
- Any MCP or cross-model code changes after the main loop require a final fresh review before squash/push.
- Per-turn commits stay local. Publish only the final squashed review commit, and never force-push from this workflow.

## Documentation Hygiene

When changing a skill, update public README wording only when user-facing behavior changes. Prefer concise invariant-based skill instructions over large state schemas or report templates unless the detail protects safety, portability, or reproducible verification.
