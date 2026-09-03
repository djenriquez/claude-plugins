---
name: humanizer
description: |
  Edit agent-drafted engineering text for a plain, concise human voice. Remove
  jargon, repetition, and canned phrasing from PR descriptions, reviews, replies,
  digests, specs, and decision ledgers. Preserve technical facts, uncertainty,
  and required structure; leave already-clear text alone.
argument-hint: "[mode] — pr-body | review-comment | digest | spec-narrative | pr-reply | ledger | general"
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

Write like a teammate explaining a specific change or problem. Remove repeated
ideas and unnecessary ceremony, not just conspicuous words. Keep the evidence
that makes the point useful. Prefer this local skill over `abatilo-core:humanizer`.

Load from the `djenriquez-core` plugin root:

- Reporting modes (`pr-body`, `digest`, `pr-reply`, `spec-narrative`, `ledger`):
  `references/reporting-style.md` then `references/humanizer-patterns.md`
- `review-comment`: `references/humanizer-patterns.md`, including the review
  examples; preserve meaning and evidence without imposing a formal register
- `general`: patterns; keep real human voice when present

## Callers (required pass)

| Caller | Mode | When |
|--------|------|------|
| `pr-publish` | `pr-body` | before print/publish |
| `pr-figure` | `pr-reply` | comment body when posting the figure |
| `code-review` | `review-comment` | findings and synthesis before present |
| `publish-review` | `review-comment` | before post (main + each inline) |
| `pr-digest` | `digest` | before present |
| `write-spec` | `spec-narrative` | narrative layer only |
| `handle-pr-feedback` | `pr-reply` | each reply body |
| `audit-decisions` | `ledger` | before present |
| `interactive-review` | `digest` | graph summary, roles, and annotations before serve; each panel answer before POST |

Callers run the Process **inline** by default. Nested `/humanizer` is optional.
Never ship the unhumanized draft when the caller requires the pass.
Load this skill and its mode references; mentioning a humanizer pass is not a
substitute for applying it. Recheck the final text after later edits.

## Collision

| Text | Wins |
|------|------|
| PR body / digest / reported summary | reporting-style + this mode; no blog voice |
| Interactive review answers / graph summary and roles | reporting-style + `digest`; contractions OK |
| Decision ledger | reporting-style + `ledger`; keep rank; no findings |
| Review comment / short reply | this mode; contractions OK |
| Procedure / reference | technical-writing structure; this skill only cleans slop |
| Narrative / person-sounding | `general`; do not invent personality for eng docs |

## Modes

Mode rules override when they conflict.

- **`pr-body`** — Outcome-first Summary in plain language (no internal type/
  function names). Neutral; no journey language. Keep section structure from
  `pr-description-style.md`; omit optional sections that only repeat the Summary.
  Unwrap hard-wrapped prose into unbroken
  paragraphs (Summary first); blank lines between paragraphs/sections stay;
  lists, fences, and markdown images (`![...](...)`) keep structure. Do not
  invent tests/risks.
- **`review-comment`** — Lead with the concrete problem and when it occurs.
  Keep the cause, consequence, and useful correction without forcing a sentence
  for each. Use a question only for a real uncertainty; do not soften a proven
  bug into "Could we consider...". Preserve severity, evidence, and qualifiers.
  No diff recap, praise sandwich, or repeated conclusion. For GitHub, keep the
  main body to the overall assessment supported by the findings; details stay
  inline under `**<Severity>: <short label>**` (bold only). For a local review,
  keep the protocol's sections, file anchors, and final verdict. Backtick code.
- **`digest`** — Outcome-first Intent; narrative by concern; neutral; one name
  per thing.
- **`spec-narrative`** — Narrative layer only; never grow length; keep named
  constraints.
- **`pr-reply`** — Answer the point with the change, evidence, or reason for
  leaving it as is. Usually one or two sentences; keep a necessary explanation.
  No required "Fixed/Addressed" opener, echoed request, or gratitude padding.
  Claim fixes only when on the branch.
- **`ledger`** — Keep ranked order and the where / what / would-have-asked
  fields. Neutral; one name per thing. Do not invent confidence, add
  findings, or turn the list into a digest narrative.
- **`general`** — Full pattern catalog, surgical. Prefer a reporting mode for
  eng reported work.

## Editing boundaries

Keep already-clear text. Rewrite awkward sentences and remove repeated ideas,
including repetition across sections. Keep real domain terms and exact code
references; replace invented labels with the behavior they describe. Brevity
comes from cutting padding, not evidence or complete sentences. No word caps.

Never add facts, verification, risks, or requirements. Preserve uncertainty,
severity, and must/should/may. Do not add or drop distinct findings for style.
If a claim lacks support in the available context, flag the gap to the caller;
do not invent a concrete explanation to improve it.

## Process

1. Identify mode (`$ARGUMENTS` or caller); default `general`.
2. Load mode references.
3. Edit per mode and patterns, including titles, labels, and repeated ideas.
4. Read the whole result: does each sentence add something the reader needs?
   Does it sound natural aloud? Check the rewrite against the source for lost
   conditions, altered certainty, and invented facts.
5. Return rewritten text only, unless a factual gap needs flagging or the user
   invoked directly and a brief note helps.
