---
name: write-spec
description: "Authors a human-first design spec: a plain-language narrative reviewers can absorb in minutes, backed by an implementation appendix with the exhaustive detail agents need. Use when the user asks to write a spec or design doc from a discussion or investigation, or to rewrite an existing spec that is too verbose for human review."
argument-hint: "[topic, or path to an existing spec to rewrite]"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Skill
  - AskUserQuestion
---

# Write Spec

Produce a spec at `docs/specs/<name>.md` that a human reviewer can grok in one sitting and an implementer can build from without the original conversation.

Load `references/spec-style.md` from the installed `djenriquez-core` plugin root before drafting. It governs structure, layering, budgets, and prose; this skill owns only the workflow.

## Resolve the mode

- `$ARGUMENTS` is a path to an existing spec file: **rewrite mode** — restructure that spec for human readability.
- Otherwise: **author mode** — write a new spec from `$ARGUMENTS` and the conversation (a design discussion, interview, or investigation is the primary source). If neither contains a clear goal, ask what to spec.

## Author mode

1. **Gather context.** Use the conversation first. Explore the codebase to fill gaps and to verify every file, symbol, and behavior claim the spec will make — an unverified `file:line` reference is worse than none. If writing the spec would require guessing an important product decision, ask; if the uncertainty is minor, record an explicit assumption and continue.
2. **Name the file.** Kebab-case, 3–6 words derived from the goal, under `docs/specs/` (create the directory if needed). When the spec originates from an issue or ticket, derive the name from its title and record the reference in the spec header.
3. **Draft per the style reference.** Narrative layer on top, implementation appendix at the bottom. Everything an implementer needs survives — demoted, not deleted.
4. **Structural sanity pass.** Only if the spec introduces new packages or modules: load `references/structure-standards.md` from the plugin root (plus `references/structure-standards-go.md` when the target repo has a root `go.mod`) and validate the proposed shape. Make each new package's responsibility, exports, and separation legible in the Design section; redesign before presenting if a package fails a standard.
5. **Completeness and readability pass.** First run the style reference's implementer test: diff the gathered context against the draft, and place every fact, constraint, and decision that shaped the design into the narrative or the appendix — the narrative budget is never met by dropping facts. Then run the reviewer test against the narrative layer alone. Fix what fails.
6. **Humanizer pass (required on narrative only).** Apply `djenriquez-core:humanizer` in `spec-narrative` mode to the narrative layer (loads reporting-style + patterns). Claude Code: `/humanizer` with mode `spec-narrative`, or load the skill inline. Codex: read the installed skill and apply. Prefer fewer ideas over growing length; meaning outranks plainness — do not drop constraints to sound simpler. Do not touch the implementation appendix. Prefer the local skill over any external humanizer. For long procedure-heavy design docs, optionally load `djenriquez-core:technical-writing` while drafting steps; it is not required for ordinary specs.
7. **Present.** Show the user the full spec and ask what to adjust. Apply requested changes before declaring the spec done.

## Rewrite mode

1. Read the existing spec fully. Inventory every technical fact it contains — constraints, code references, mappings, decisions. Nothing may be lost, only moved.
2. Restructure it into the style reference's layered form: distill the narrative, move implementer detail into the appendix, add diagrams and decision tables where the reference calls for them.
3. Verify code references still hold before carrying them into the appendix; drop or fix stale ones and note the verification point.
4. Run the completeness and readability pass — the fact inventory from step 1 is the gathered context to diff against — then the required `spec-narrative` humanizer pass on the narrative layer only. Present the rewrite alongside a short note listing anything you corrected or flagged as stale.

## Harness notes

- **Claude Code**: this skill may be invoked directly (`/write-spec`) or by orchestrators such as `issue-to-spec` and `full-dev-flow`.
- **Codex**: if direct skill invocation is unavailable, read this installed `SKILL.md` and `references/spec-style.md` and follow them exactly. Apply the humanizer pass by reading `djenriquez-core:humanizer` and `references/humanizer-patterns.md`.
