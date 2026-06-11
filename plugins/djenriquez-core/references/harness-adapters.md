# Harness Adapter Reference

Load this only when a workflow needs to translate between Claude Code style tools and Codex style tools.

## Skill Invocation

- Claude Code: invoke installed skills with slash commands such as `/spec-review` or `/self-review-loop`.
- Codex: use the installed skill name when available, such as `djenriquez-core:spec-review`. If direct skill invocation is unavailable, read the target `SKILL.md` and follow it.

Do not reimplement a sub-skill when it is available and compatible.

## Agents And Teams

- Claude Code `Task(...)` maps to a Codex `spawn_agent` call.
- Use fresh, read-only agents for review work.
- In Codex, prefer `agent_type: "explorer"` for read-only review agents unless the agent must invoke another skill.
- Use `fork_context: false` when the review must be unbiased by the current conversation.
- Claude `TeamCreate`, `TeamDelete`, and task bookkeeping map to local plan notes in Codex unless explicit team tools exist.
- Claude `SendMessage` maps to collected sub-agent output in Codex. If an agent must respond to a challenge after its first output, use the harness's follow-up input mechanism when available.

## Prompt Construction

Sub-agents only see what their prompt or accessible tools provide. Prefer this order:

1. Give the repository path, base branch, and changed-file inventory.
2. Tell the agent which local commands to run for targeted diffs or files.
3. Inline small content only when it is cheaper than forcing discovery.
4. Avoid pasting large full diffs or full specs into every specialist prompt.

If a harness cannot register custom agent definitions, include only the selected specialist's short instruction file plus the shared protocol needed for that task.

## Compatibility Rule

Nested skill execution is allowed only when the child skill's required tools are available to the spawned agent. If compatibility is absent or unproven, use a direct prompt path instead of asking a sub-agent to run a skill it cannot complete.
