# Harness Adapter Reference

Load this only when a workflow needs to translate between Claude Code style tools and Codex style tools.

## Skill Invocation

- Claude Code: invoke installed skills with slash commands such as `/spec-review` or `/self-review-loop`.
- Codex: use the installed skill name when available, such as `djenriquez-core:spec-review`. If direct skill invocation is unavailable, read the target `SKILL.md` and follow it.

Do not reimplement a sub-skill when it is available and compatible.

## Plugin Resource Paths

Unqualified `references/...` and `protocols/...` resolve from the installed
`djenriquez-core` **plugin root** (the directory that contains `.claude-plugin/`,
`skills/`, `references/`, and `protocols/` as siblings). They do **not** resolve
relative to the calling `skills/<name>/` directory.

Example: `references/spec-style.md` → `<plugin-root>/references/spec-style.md`,
never `skills/write-spec/references/spec-style.md`.

Skill-local files under `skills/<name>/references/` exist only when a skill
names that path explicitly.

## Nested Skill Fallback

When a parent skill requires a child pass (especially humanizer) and nested
slash-command / Skill-tool invocation is unavailable, awkward, or unproven:

1. Read the child skill's `SKILL.md` and its listed references from the plugin root.
2. Apply the child's Process section inline in the current turn.
3. Do not skip a required pass because nesting failed.

## Agents And Teams

Use fresh, read-only agents for review work. Map spawn tools by harness:

| Harness | Spawn specialists | Cross-review / follow-up |
|---------|-------------------|--------------------------|
| **Claude Code** | `Task` / team primitives (`TeamCreate`, `TaskCreate`, …) with agent definitions under `<plugin-root>/agents/` | Lead `SendMessage`; specialists may wait for challenges when team tools exist |
| **Cursor** | `Task` with registered `subagent_type` matching `*-reviewer` names (`clarity-reviewer`, `completeness-reviewer`, `api-reviewer`, `feasibility-reviewer`, `operations-reviewer`, `product-reviewer`, `scope-reviewer`, `complexity-reviewer`, `structure-reviewer`, …) | One-shot return to the parent. Lead collects Phase 1 output, then spawns a **second** Task (prefer `resume` when available) with only disputed findings. Do not expect idle wait / `SendMessage` |
| **Codex** | `spawn_agent`; prefer `agent_type: "explorer"` for read-only review unless another skill must run; `fork_context: false` when the review must be unbiased | Follow-up input or second spawn; Claude `TeamCreate` / `TaskUpdate` map to local plan notes unless explicit team tools exist |

Claude Code `SendMessage` / “wait for cross-review / do not exit” are **not** portable. In Cursor and other one-shot Task harnesses, the specialist’s Phase 1 **final response body** is the deliverable; the lead owns orchestration.

When a harness registers `*-reviewer` types, pass a tight prompt (paths, risk lane, section anchors) and let the registered agent definition supply specialist focus. Still instruct the agent to load `<plugin-root>/protocols/review-protocol.md` so protocol drift does not depend on the lead pasting it.

## Prompt Construction

Sub-agents only see what their prompt or accessible tools provide. Prefer this order:

1. Give the repository path, base branch, and changed-file inventory.
2. Tell the agent which local commands to run for targeted diffs or files.
3. Inline small content only when it is cheaper than forcing discovery.
4. Avoid pasting large full diffs or full specs into every specialist prompt.

If a harness cannot register custom agent definitions, include only the selected specialist's short instruction file plus the shared protocol needed for that task.

## Compatibility Rule

Nested skill execution is allowed only when the child skill's required tools are available to the spawned agent. If compatibility is absent or unproven, use a direct prompt path instead of asking a sub-agent to run a skill it cannot complete.
