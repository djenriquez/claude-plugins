---
name: humanizer
description: |
  Rewrite agent-drafted text so a human can skim it without AI jargon or bloated
  terminology. Use when editing PR descriptions, review comments, digests, specs,
  decision ledgers, interactive-review answers, or any other text people must
  read. Surgical: fix contaminated sections only; preserve technical claims,
  structure, and real specificity. Pairs with reporting-style for reported work
  and technical-writing for procedures.
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

Surgical AI-slop cleanup for engineering text. Prefer this local skill over
`abatilo-core:humanizer`. No numeric word caps — fewer ideas, not fragments.

Load from the `djenriquez-core` plugin root:

- Reporting modes (`pr-body`, `digest`, `pr-reply`, `spec-narrative`, `ledger`):
  `references/reporting-style.md` then `references/humanizer-patterns.md`
- `review-comment`: patterns; light meaning/evidence; teammate voice wins
- `general`: patterns; keep real human voice when present

## Callers (required pass)

| Caller | Mode | When |
|--------|------|------|
| `pr-publish` | `pr-body` | before print/publish |
| `pr-figure` | `pr-reply` | comment body when posting the figure |
| `publish-review` | `review-comment` | before post (main + each inline) |
| `pr-digest` | `digest` | before present |
| `write-spec` | `spec-narrative` | narrative layer only |
| `handle-pr-feedback` | `pr-reply` | each reply body |
| `audit-decisions` | `ledger` | before present |
| `interactive-review` | `digest` | graph summary, roles, and annotations before serve; each panel answer before POST |

Callers run the Process **inline** by default. Nested `/humanizer` is optional.
Never ship the unhumanized draft when the caller requires the pass.

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
  `pr-description-style.md`. Unwrap hard-wrapped prose into unbroken
  paragraphs (Summary first); blank lines between paragraphs/sections stay;
  lists, fences, and markdown images (`![...](...)`) keep structure. Do not
  invent tests/risks.
- **`review-comment`** — Teammate voice; preserve claims/severity; no new
  findings. Main body: qualitative skim only. Inline:
  `**<Severity>: <short label>**` then body; bold only. Lead with
  defect/risk/question; backtick code; no hunk paraphrase or fluff.
- **`digest`** — Outcome-first Intent; narrative by concern; neutral; one name
  per thing.
- **`spec-narrative`** — Narrative layer only; never grow length; keep named
  constraints.
- **`pr-reply`** — One or two factual sentences; claim fixes only when on the
  branch; no gratitude padding.
- **`ledger`** — Keep ranked order and the where / what / would-have-asked
  fields. Neutral; one name per thing. Do not invent confidence, add
  findings, or turn the list into a digest narrative.
- **`general`** — Full pattern catalog, surgical. Prefer a reporting mode for
  eng reported work.

## Surgical editing

1. Read the whole text. Protect already-human sections.
2. Rewrite only contaminated or jargon-heavy parts; match surrounding voice.
3. Prefer shorter by dropping surplus ideas. Expand cryptic shorthand when
   unreadable.
4. Never invent verification, risks, or requirements.

## Process

1. Identify mode (`$ARGUMENTS` or caller); default `general`.
2. Load mode references.
3. Map protected vs contaminated; rewrite per mode + patterns.
4. Skim: outcome first; cold reader ok; no invented/softened/renamed claims.
5. Return rewritten text only (unless user invoked directly and a brief note
   helps).
