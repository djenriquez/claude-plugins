---
name: humanizer
description: |
  Shared writing rules and plain-language voice cleanup for engineering text:
  PR descriptions, reviews, replies, digests, specs, decision ledgers, and
  narration. Enforces meaning first, behavior before symbols, verified
  evidence, and removal of jargon, repetition, and canned phrasing; leaves
  already-clear text alone.
argument-hint: "[mode] — pr-body | review-comment | digest | spec-narrative | pr-reply | ledger | narration | general"
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

Single source of truth for human-facing engineering prose in `djenriquez-core`.
Write like a teammate explaining a specific change or problem. Remove repeated
ideas and unnecessary ceremony, not just conspicuous words. Keep the evidence
that makes the point useful. Prefer this local skill over `abatilo-core:humanizer`.

Load `references/humanizer-patterns.md` from the `djenriquez-core` plugin root
alongside this file. For procedures, runbooks, and reference docs a reader
follows step by step, pair with `skills/technical-writing/SKILL.md`.

## Core rules

These rules apply to all engineering modes (`pr-body`, `review-comment`,
`digest`, `spec-narrative`, `pr-reply`, `ledger`, `narration`) unless a mode
overrides register or structure. `general` takes only **Meaning first** and
**Verified evidence only**, preserving the author's voice.

- **Meaning first:** get the meaning right, then make the language plain.
  Preserve identifiers, commands, paths, error text, units, operation sequence,
  uncertainty, and normative force (`must` / `should` / `may`). Use one name
  for one component, service, state, or result; a synonym reads as a second
  thing. Name a gap instead of filling it with a plausible guess.
- **Outcome and behavior first:** open with the outcome or change in plain
  behavioral terms, putting file paths, line numbers, and internal symbol names
  after the behavior is clear so the reader does not have to decode internal
  types first. When explaining a design issue, trade-off, or review finding,
  open with what goes wrong in practice using a concrete scenario (with the
  system's intent as the context that makes it wrong), and when comparing
  options, spell out what changes for the caller or operator under each one.
  Expand compressed agent shorthand (`Fixed: timeout → retry path → green.`)
  into complete sentences.
- **Brevity means fewer ideas:** cut repeated explanations across sections and
  details that do not change what the reader understands or does next, rather
  than compressing sentences into fragments. Do not enforce numeric word-count
  caps mid-generation; they make models clip meaning.
- **Verified evidence only:** claim a test passed, a build succeeded, or a bug
  is fixed only when tool output or the repository showed it. Otherwise say you
  expect it or that it is unverified. When work is unfinished, say what remains
  and why.
- **Plain register:** use ordinary professional language. Replace invented
  labels with the behavior they describe. Do not add banter, generic praise, or
  personal anecdotes to sound human.

## Callers (required pass)

This table is the canonical caller-to-mode map for `djenriquez-core`:

| Caller | Mode | When |
|--------|------|------|
| `pr-publish` | `pr-body` | title and body before print/publish |
| `pr-figure` | `pr-reply` | comment body when posting the figure |
| `code-review` | `review-comment` | findings and synthesis before present |
| `publish-review` | `review-comment` | main body and each inline comment before post |
| `write-spec` | `spec-narrative` | narrative layer only |
| `handle-pr-feedback` | `pr-reply` | each reply body before post |
| `audit-decisions` | `ledger` | ledger before present |
| `audit-state-machines` | `digest` | report before present |
| `guided-review` | `digest`, `review-comment` | explanations and point walkthroughs before present; each comment draft before it is shown |
| `interactive-review` | `digest` | graph summary, roles, and annotations before serve; each panel answer before POST |
| `lecture-video` | `narration`, `digest` | spoken beats and on-screen text before script checkpoint; final delivery report |

Callers follow the Core rules **while drafting**, and the pass checks and
tightens what was drafted (the editing pass cannot invent missing facts or
scenarios). Callers run the Process **inline** by default; nested `/humanizer`
is optional. Never ship the unhumanized draft when the caller requires the
pass. Load this skill and `references/humanizer-patterns.md`; mentioning a
humanizer pass is not a substitute for applying it. Recheck the final text
after later edits.

## Collision

| Text | Wins |
|------|------|
| PR body / digest / reported summary | core rules + this mode; neutral, no blog voice |
| Interactive review answers / graph summary and roles | core rules + `digest`; contractions OK |
| Decision ledger | core rules + `ledger`; keep rank; no findings |
| Review comment / short reply | core rules + this mode; teammate voice, contractions OK |
| Video narration | core rules + `narration`; spoken and warm, not formal report register |
| Procedure / reference | `technical-writing` structure; this skill cleans AI tells without imposing narrative voice |
| Narrative / person-sounding | `general` (meaning first + verified evidence only; keep real voice, do not invent personality for eng docs) |

## Modes

Mode rules override when they conflict.

- **`pr-body`** — Outcome-first Summary in plain language (no internal type/
  function names). Neutral; no journey language. Keep section structure from
  `references/pr-description-style.md`; omit optional sections that only repeat
  the Summary. Unwrap hard-wrapped prose into unbroken paragraphs (Summary
  first); blank lines between paragraphs/sections stay; lists, fences, and
  markdown images (`![...](...)`) keep structure. Do not invent tests/risks.
- **`review-comment`** — Lead with the concrete problem and when it occurs, in
  plain behavioral terms before diving into internal type or symbol names.
  Teammate voice; contractions OK. Keep the cause, consequence, and useful
  correction without forcing a sentence for each. Use a question only for a
  real uncertainty; do not soften a proven bug into "Could we consider...".
  Preserve severity, evidence, and qualifiers. No diff recap, praise sandwich,
  or repeated conclusion. For GitHub, keep the main body to the overall
  assessment supported by the findings; details stay inline under
  `**<Severity>: <short label>**` (bold only). For a local review, keep the
  protocol's sections, file anchors, and final verdict. Backtick code.
- **`digest`** — Outcome first; narrative by concern; neutral; one name per
  thing; contractions OK when explaining interactively.
- **`spec-narrative`** — Narrative layer only; never grow length; keep named
  constraints.
- **`pr-reply`** — Answer the point with the change, evidence, or reason for
  leaving it as is. Usually one or two sentences; keep a necessary explanation.
  No required "Fixed/Addressed" opener, echoed request, or gratitude padding.
  Claim fixes only when on the branch.
- **`ledger`** — Keep ranked order and the where / what / would-have-asked
  fields. Neutral; one name per thing. Do not invent confidence, add findings,
  or turn the list into a digest narrative.
- **`narration`** — Spoken script for a video viewer. Contractions and warmth
  are fine; each sentence carries one idea. Cut stock openers, transitions, and
  sign-offs ("Hey there, and welcome!", "Let's dive in"), hype, and filler
  questions; open on the problem. Keep ear-spellings ("A P I", "engine X") in
  spoken text and real spelling on screen. Keep the source's certainty and
  every open question; do not merge or split sentences without saying so,
  because each sentence is a timed beat.
- **`general`** — Full pattern catalog, surgical. Prefer a specific mode above
  for engineering text.

## Editing boundaries

Keep already-clear text. Rewrite awkward sentences and remove repeated ideas,
including repetition across sections. Never add facts, verification, risks, or
requirements, and do not add or drop distinct findings for style. If a claim
lacks support in the available context, flag the gap to the caller; do not
invent a concrete explanation to improve it.

## Process

1. Identify mode (`$ARGUMENTS` or caller); default `general`.
2. Load `references/humanizer-patterns.md`.
3. Edit per Core rules, mode, and patterns, including titles, labels, and
   repeated ideas.
4. Final skim (four concrete checks, not a ritual checklist):
   - Does the opening give the outcome or problem in plain behavior before
     symbols?
   - Compare the rewrite against the source: did you drop a condition, alter
     certainty (for example turning "may fail" into "fails"), soften a
     requirement, invent verification or facts, or rename the same thing twice?
   - Would a reader who only has this text (not your session) understand it?
   - Does it sound natural aloud? (Especially important for `narration` and
     `review-comment`.)
5. Return rewritten text only, unless a factual gap needs flagging or the user
   invoked directly and a brief note helps.
