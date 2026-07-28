---
name: humanizer
description: |
  Rewrite agent-drafted text so a human can skim it without AI jargon or bloated
  terminology. Use when editing PR descriptions, review comments, digests, specs,
  or any other text people must read. Surgical: fix contaminated sections only;
  preserve technical claims, structure, and real specificity.
argument-hint: "[mode] — pr-body | review-comment | digest | spec-narrative | pr-reply | general"
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
---

# Humanizer

Make text easy for a human teammate to absorb. The reader is busy: they should
understand the point in one skim, then dig into detail only if they need it.

This skill is a **fork** of `abatilo-core:humanizer` (Wikipedia "Signs of AI
writing"), adapted for engineering artifacts. Prefer this local skill over the
external one.

Load `references/humanizer-patterns.md` from the installed `djenriquez-core`
plugin root before rewriting. That file holds the pattern catalog; this skill
owns process, modes, and the contract other skills call.

## When other skills call this

Human-facing djenriquez-core skills must run a humanizer pass before publishing
or presenting final text:

| Caller | Mode | Required |
|--------|------|----------|
| `pr-publish` | `pr-body` | yes, before printing/publishing |
| `publish-review` | `review-comment` | yes, before preview |
| `pr-digest` | `digest` | yes, before presenting the digest |
| `write-spec` | `spec-narrative` | yes, narrative layer only |
| `handle-pr-feedback` | `pr-reply` | yes, for each reply body |

**Claude Code**: invoke `/humanizer` with the mode, or apply this skill inline
after loading the patterns reference.

**Codex**: read this installed `SKILL.md` and `references/humanizer-patterns.md`,
then apply the pass. Do not skip the pass because a nested skill call is awkward.

Fallback: if this skill cannot be invoked, load the patterns reference and run
the Process section below against the draft. Never ship the unhumanized draft
when the caller marks the pass required.

## Modes

Pick one mode. Mode rules override general tone when they conflict.

### `pr-body`

Target: a reviewer who has the base branch and the diff, not the author's journey.

- Lead with plain-language problem and outcome in the Summary. No internal type
  or function names there.
- Prefer concrete verbs: "Adds", "Fixes", "Rejects", "Caches" — not "enhances",
  "streamlines", "leverages", "ensures".
- Neutral and factual. No marketing, no self-congratulation, no journey language
  (see `references/pr-description-style.md` when drafting structure).
- Keep section structure; shorten bloated sentences inside sections.
- Do not invent test results, risks, or behavior the draft did not claim.

### `review-comment`

Target: a teammate with the diff open.

- 2–4 short sentences for substantive findings; shorter for nits.
- Point at the mechanism, not the author.
- Preserve the technical claim, severity, path, and line. Do not add findings.
- Strip severity labels from the body; prefix only `low`/`nit` with `Nit: `.
- No corporate openers, no closing pleasantries, no markdown headers in inline
  comments, no em-dash stacks.
- Good shape: what happens, why it matters in runtime/API/correctness terms,
  optional real question for tradeoffs.

### `digest`

Target: someone who has not read the PR and needs a mental model fast.

- Narrative over inventory. Group by concern, not file list dump.
- Match the codebase's technical level; do not over-explain domain standards.
- Neutral: explain, do not evaluate or praise.
- Cut filler transitions between sections.

### `spec-narrative`

Target: a human reviewing design intent in minutes.

- Operate on the narrative layer only. Do not touch implementation appendix
  precision, tables of `file:line` mappings, or budgeted structure.
- Never grow the word count. Prefer cuts over rewrites.
- Keep named constraints and decisions; only clean the prose around them.

### `pr-reply`

Target: a reviewer reading a thread reply.

- One or two factual sentences. "Fixed — …" / "Skipped — …".
- No "Great catch!", "Thanks for the feedback!", or defensive padding.

### `general`

Default for freeform text. Apply the full pattern catalog surgically. Keep the
author's real voice when it is already human; do not impose blog personality on
engineering text.

## Surgical editing (invariant)

The common failure mode is over-editing. Do not rewrite clean prose.

1. Read the whole text before changing anything.
2. Protect sections that already sound human: real details, specific claims,
   natural rhythm, accurate technical names where they belong.
3. Rewrite only contaminated or jargon-heavy sections.
4. Match surrounding voice; do not replace it with generic "clean" mush.
5. Never increase word count. Output should be shorter than input unless the
   input was so cryptic that one clarifying phrase is required (rare; prefer
   restructuring over adding).

## Process

1. **Identify the mode** from `$ARGUMENTS` or the calling skill. Default `general`.
2. **Load** `references/humanizer-patterns.md`.
3. **Read** the full draft. Map protected (already clear) vs contaminated sections.
4. **Rewrite** contaminated sections per mode + pattern catalog.
5. **Skim test**: read only the first screen / Summary / first two sentences.
   Would a busy engineer understand the point without knowing the generation
   history? If not, rewrite the lead again.
6. **Verify**: no new claims, no dropped technical facts that belonged, shorter
   or equal length, mode constraints held.
7. **Return** only the rewritten text to the caller (no meta commentary) unless
   the user invoked this skill directly and a brief change note would help.

## Direct invocation output

When the user runs `/humanizer` on their own text:

1. The rewritten text
2. Optional short note of what classes of patterns were removed (not a full diff)

When another skill runs this as a pass: return the rewritten artifact only and
continue the caller's workflow.
