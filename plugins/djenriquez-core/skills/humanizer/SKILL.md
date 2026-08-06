---
name: humanizer
description: |
  Rewrite agent-drafted text so a human can skim it without AI jargon or bloated
  terminology. Use when editing PR descriptions, review comments, digests, specs,
  or any other text people must read. Surgical: fix contaminated sections only;
  preserve technical claims, structure, and real specificity. Pairs with
  reporting-style for reported work and technical-writing for procedures.
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

## Layered writing system

Three layers, loaded by need — do not dump all of them into every session:

| Layer | Where | When |
|-------|--------|------|
| **Reporting tone** | `references/reporting-style.md` | PR bodies, digests, replies, turn summaries, other reported work |
| **AI cleanup (this skill)** | `skills/humanizer` + `references/humanizer-patterns.md` | Before publish/present of human-facing text |
| **Procedure/reference craft** | `djenriquez-core:technical-writing` | Only when authoring a runbook, how-to, README, API reference, or similar |

Reporting tone is thin and always relevant for reported work. Technical writing
craft is opt-in. This skill removes AI contamination without forcing essay
personality onto engineering docs.

Load from the installed `djenriquez-core` plugin root:

1. For reporting modes (`pr-body`, `digest`, `pr-reply`, `spec-narrative`):
   `references/reporting-style.md` then `references/humanizer-patterns.md`
2. For `review-comment`: patterns file; apply reporting's meaning/evidence
   rules lightly; teammate voice wins on contractions and register
3. For `general`: patterns file; preserve real human voice when present

## When other skills call this

Human-facing djenriquez-core skills must run a humanizer pass before publishing
or presenting final text:

| Caller | Mode | Required |
|--------|------|----------|
| `pr-publish` | `pr-body` | yes, before printing/publishing |
| `publish-review` | `review-comment` | yes, before posting (main body + each inline) |
| `pr-digest` | `digest` | yes, before presenting the digest |
| `write-spec` | `spec-narrative` | yes, narrative layer only |
| `handle-pr-feedback` | `pr-reply` | yes, for each reply body |

**Default for callers (all harnesses):** load this `SKILL.md` and the listed
references from the plugin root, then run the Process section **inline** in the
current turn. Nested `/humanizer` / Skill-tool invocation is optional and only
worth using when it is known to work in that harness.

**Claude Code convenience:** when nested skill invocation works, `/humanizer`
with the mode is fine; otherwise stay on the inline default.

Never skip a required pass because nested skill invocation is unavailable or
awkward. Never ship the unhumanized draft when the caller marks the pass
required.

## Collision rules

| Text kind | Who wins |
|-----------|----------|
| PR body, digest, reported summary | reporting-style + this skill in reporting modes. Neutral, outcome-first. No blog voice. |
| Review comment, short PR reply | this skill's mode. Teammate voice; natural contractions OK. |
| Procedure / reference / long how-to | technical-writing for structure; this skill only for AI-slop cleanup. |
| Narrative essay / person-sounding prose | this skill `general`; voice guidance applies. |

Do not enforce numeric sentence word caps. Models clip meaning to satisfy
counts. Prefer fewer ideas and one topic per sentence.

## Modes

Pick one mode. Mode rules override general tone when they conflict.

### `pr-body`

Target: a reviewer who has the base branch and the diff, not the author's journey.

- Apply `references/reporting-style.md` fully.
- Lead with plain-language problem and outcome in the Summary. No internal type
  or function names there.
- Prefer concrete verbs: "Adds", "Fixes", "Rejects", "Caches" — not "enhances",
  "streamlines", "leverages", "ensures".
- Neutral and factual. No marketing, no self-congratulation, no journey language
  (see `references/pr-description-style.md` for structure).
- Expand arrow-chain shorthand into whole sentences.
- Brevity = fewer ideas, not telegraphic fragments.
- Keep section structure; shorten bloated sentences inside sections.
- Do not invent test results, risks, or behavior the draft did not claim.
- Preserve normative force and exact identifiers while cleaning.

### `review-comment`

Two shapes under this mode (publish-review uses both):

**Main review body** (top-level GitHub review `body`): qualitative skim summary
for the notification. About 2–5 sentences on how close to approve, how much
work remains, and what themes matter. Leave per-line detail to inline
comments. No `**Severity: label**` wrapper, no `#` headers, no finding dump.
Do not invent severity or effort the findings do not support.

**Inline finding** (anchored comment): teammate with the diff open at the line.

- Keep (or restore) the mechanical lead-in on its own line:
  `**<Severity>: <short label>**` then a blank line, then the body.
  Severity is one of `Critical`, `High`, `Medium`, `Low`, `Nit`. Use bold only
  — never `#` headers.
- Prefer 1–2 short sentences in the body; 3 only for a real tradeoff question.
  Nits are often one sentence. Do not pad to a 2–4 sentence template.
- Do not restate what the hunk already shows (`This adds…`, `This now…`,
  `Here we…`). Start at the defect, risk, missing guard, or decision.
- Point at the mechanism, not the author.
- Use inline backticks for code and logic references (identifiers, APIs,
  fields, literals, short conditions). Do not wrap whole sentences in code.
- Preserve the technical claim, severity, path, and line. Do not add findings.
- Do not repeat severity inside the body prose; it belongs only in the bold
  lead-in.
- No corporate openers, no closing pleasantries, no markdown headers in inline
  comments, no em-dash stacks.
- Good shape: failure mode or risk in runtime/API/correctness terms, then an
  optional real question for tradeoffs. Skip the happy-path narration.
- Do not rewrite evidence or soften a hard correctness claim into a vague nit.

### `digest`

Target: someone who has not read the PR and needs a mental model fast.

- Apply reporting-style: outcome-first Intent, whole sentences, no shorthand.
- Narrative over inventory. Group by concern, not file list dump.
- Match the codebase's technical level; do not over-explain domain standards.
- Neutral: explain, do not evaluate or praise.
- Cut filler transitions between sections. One name for one thing.

### `spec-narrative`

Target: a human reviewing design intent in minutes.

- Operate on the narrative layer only. Do not touch implementation appendix
  precision, tables of `file:line` mappings, or budgeted structure.
- Never grow the word count. Prefer cuts over rewrites (fewer ideas).
- Keep named constraints and decisions; only clean the prose around them.
- Meaning outranks plainness: do not drop a constraint to sound simpler.

### `pr-reply`

Target: a reviewer reading a thread reply.

- One or two factual sentences. "Fixed — …" / "Skipped — …".
- No "Great catch!", "Thanks for the feedback!", or defensive padding.
- Claim a fix only when the change is in the branch; otherwise say what remains.

### `general`

Default for freeform text. Apply the full pattern catalog surgically. Keep the
author's real voice when it is already human; do not impose blog personality on
engineering text. For engineering reported work, prefer a reporting mode instead.

## Surgical editing (invariant)

The common failure mode is over-editing. Do not rewrite clean prose.

1. Read the whole text before changing anything.
2. Protect sections that already sound human: real details, specific claims,
   natural rhythm, accurate technical names where they belong.
3. Rewrite only contaminated or jargon-heavy sections.
4. Match surrounding voice; do not replace it with generic "clean" mush.
5. Prefer shorter by dropping surplus ideas, not by compressing into fragments.
   Expanding cryptic shorthand into one clear sentence is allowed when the
   original was unreadable.
6. Never invent verification, risks, or requirements while cleaning.

## Process

1. **Identify the mode** from `$ARGUMENTS` or the calling skill. Default `general`.
2. **Load** the references for that mode (reporting-style when applicable, then
   humanizer-patterns).
3. **Read** the full draft. Map protected (already clear) vs contaminated sections.
4. **Rewrite** contaminated sections per mode + reporting + pattern catalog.
5. **Skim test** (three checks): first sentence gives the outcome; a cold reader
   would understand; no invented verification, softened requirements, or renamed
   same-thing-twice.
6. **Verify**: technical facts preserved, mode constraints held, AI patterns gone.
7. **Return** only the rewritten text to the caller (no meta commentary) unless
   the user invoked this skill directly and a brief change note would help.

## Direct invocation output

When the user runs `/humanizer` on their own text:

1. The rewritten text
2. Optional short note of what classes of patterns were removed (not a full diff)

When another skill runs this as a pass: return the rewritten artifact only and
continue the caller's workflow.
