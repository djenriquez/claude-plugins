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

Default-path djenriquez-core workflows should prefer local djenriquez-core skills. External plugin skills may remain as optional fallbacks, but they should not be required for the core product experience.

## Human-Facing Output

Three writing layers, loaded by need (do not dump all into every session):

1. **Reporting tone** (`references/reporting-style.md`) — thin rules for reported work: meaning first, outcome first, fewer ideas (not compressed fragments), claim only verified results.
2. **Humanizer** (`skills/humanizer` + `references/humanizer-patterns.md`) — required cleanup pass before publish/present for `pr-publish`, `publish-review`, `pr-digest`, `write-spec` narrative, and `handle-pr-feedback` replies. Prefer local over `abatilo-core:humanizer`.
3. **Technical writing** (`skills/technical-writing`) — opt-in craft for runbooks, how-tos, READMEs, and reference pages a reader follows. Not required for ordinary PR summaries.

Do not add numeric sentence word caps or long always-on style checklists; models clip meaning to satisfy them. Collision rules live in the humanizer skill.

## Lean Review Policy

Code review should be staged by risk:

- L0: one concise generalist review, no specialist fan-out, no debate.
- L1: generalist first, then only evidence-triggered specialists.
- L2: bounded specialists with explicit selection criteria.

External debate is an escalation tool for uncertain high-severity findings, specialist disagreement, or judgment-sensitive L2 verdicts. It is not a default per-agent ritual.

Speculative concerns are not actionable findings. Keep rare useful observations explicitly non-actionable, without severity or verdict impact.

## PR Feedback Invariants

- Use `protocols/feedback-disposition.md` whenever review feedback can cause code changes.
- Group comments by root cause while preserving a mapping to every original thread or finding.
- Pause mutation only for clusters that expand design scope or cross the complexity gate, plus clusters that share their remedy or files. Independent `FIX NOW` and conclusive `NO CHANGE` work may continue. Invoking a feedback workflow does not preauthorize new production mechanisms.
- Treat size (roughly >50 non-test lines or >3 production files) as a soft checkpoint, not an automatic `NEEDS DECISION`. The hard gate is the gated-mechanism list.
- Resolve only verified fixes and conclusive no-change outcomes. Leave decision-gated threads unresolved.

## Self-Review Loop Invariants

`plugins/djenriquez-core/skills/self-review-loop/SKILL.md` is meant to be a safety-critical orchestration skill. Preserve these invariants when editing it:

- Review turns use fresh, context-free, read-only reviewers against the local diff from `origin/<pr_base_ref>...HEAD`.
- Successful completion requires no unresolved Critical or High findings after severity normalization. Max turns, oscillation, and final-review failures are blocked states, not successful exits.
- Only demonstrated blocking findings drive loop edits. After evidence validation, concrete correctness, security, data-loss, broken-contract, or failing-verification issues are blocking regardless of the reviewer's Medium/Low label. Remaining Medium/Low findings and non-actionable observations do not create fix turns.
- Apply the shared feedback complexity gate before mutation and before each per-turn commit. Pause only gated clusters and shared-remedy dependents; allow independent local fixes to proceed.
- Prefer the local lean `djenriquez-core:code-review` path when available. Direct fallback must follow the same staged L0/L1/L2 policy.
- Any MCP or cross-model code changes after the main loop require a final fresh review before squash/push.
- Per-turn commits stay local. Publish only the final squashed review commit, and never force-push from this workflow.

## Documentation Hygiene

When changing a skill, update public README wording only when user-facing behavior changes. Prefer concise invariant-based skill instructions over large state schemas or report templates unless the detail protects safety, portability, or reproducible verification.
