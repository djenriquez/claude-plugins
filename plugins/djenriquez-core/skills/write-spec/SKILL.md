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

Before drafting, load `<plugin-root>/references/spec-style.md`. The plugin root
is the installed `djenriquez-core` directory that contains `.claude-plugin/`,
`skills/`, and `references/` as siblings — **not** this skill's own directory.
(`skills/write-spec/references/spec-style.md` does not exist.) The style
reference governs structure, layering, budgets, and prose; this skill owns only
the workflow.

If the target repo has `docs/specs/CLAUDE.md` (or similar local spec guidance),
honor both: use this plugin's layered narrative + appendix shape, and apply any
repo rules that do not conflict (for example present-tense standalone prose, no
branch edit-history narration). When they conflict on structure, this plugin's
`spec-style.md` wins; when they conflict on repo-specific voice or invariants,
the repo file wins for content written into that repository.

## Resolve the mode

- `$ARGUMENTS` is a path to an existing spec file: **rewrite mode** — restructure that spec for human readability.
- Otherwise: **author mode** — write a new spec from `$ARGUMENTS` and the conversation (a design discussion, interview, or investigation is the primary source). If neither contains a clear goal, ask what to spec.

## Author mode

1. **Gather context.** Use the conversation first. Explore the codebase to fill gaps and to verify every file, symbol, and behavior claim the spec will make — an unverified `file:line` reference is worse than none. If writing the spec would require guessing an important product decision, ask; if the uncertainty is minor, record an explicit assumption and continue.
2. **Name the file.** Kebab-case, 3–6 words derived from the goal, under `docs/specs/` (create the directory if needed). When the spec originates from an issue or ticket, derive the name from its title and record the reference in the spec header.
3. **Draft per the style reference.** Narrative layer on top, implementation appendix at the bottom. Everything an implementer needs survives — demoted, not deleted.
4. **Structural sanity pass.** Only if the spec introduces new packages or modules: load `<plugin-root>/references/structure-standards.md` (plus `<plugin-root>/references/structure-standards-go.md` when the target repo has a root `go.mod`) and validate the proposed shape. Make each new package's responsibility, exports, and separation legible in the Design section; redesign before presenting if a package fails a standard.
5. **Completeness and readability pass.** First run the style reference's implementer test: diff the gathered context against the draft, and place every fact, constraint, and decision that shaped the design into the narrative or the appendix — the narrative budget is never met by dropping facts. Then run the reviewer test against the narrative layer alone. Fix what fails.
6. **Humanizer (required, narrative only).** Apply `spec-narrative` inline
   (local humanizer). Do not grow length or drop constraints; leave the
   appendix untouched. Optional `technical-writing` only for procedure-heavy
   design docs.
7. **Present.** Show the full spec; apply requested adjustments before done.

## Rewrite mode

1. Read the existing spec fully. Inventory every technical fact it contains — constraints, code references, mappings, decisions. Nothing may be lost, only moved.
2. Restructure it into the style reference's layered form: distill the narrative, move implementer detail into the appendix, add diagrams and decision tables where the reference calls for them.
3. Verify code references still hold before carrying them into the appendix; drop or fix stale ones and note the verification point.
4. Run the completeness and readability pass — the fact inventory from step 1 is the gathered context to diff against — then the required `spec-narrative` humanizer pass on the narrative layer only. Present the rewrite alongside a short note listing anything you corrected or flagged as stale.

## Harness notes

Invoke via host (`/write-spec` or orchestrators). Without nested Skill tools,
read this `SKILL.md` and `references/spec-style.md` and apply humanizer inline.
Unqualified `references/` means the plugin root, sibling to `skills/`.
