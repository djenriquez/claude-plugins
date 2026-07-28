---
name: technical-writing
description: |
  Write clear instructional and reference prose for documents a reader follows
  or looks facts up in: runbooks, procedures, how-to guides, READMEs, API or
  configuration references, troubleshooting pages, migration guides, release
  notes, architecture decision records, or long follow-along PR sections.
  Covers imperative steps, condition-before-command order, consistent
  terminology, noun stacks, list structure, and warnings on destructive steps.
  Use humanizer for AI-slop cleanup and narrative voice; use reporting-style for
  the always-on register of reported work.
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
---

# Technical Writing

Sentence-level craft for a document a reader **follows** or **looks facts up
in**. Load this skill only when authoring or editing that kind of document —
not for every PR summary or turn report.

Also load (from the installed `djenriquez-core` plugin root):

- `references/reporting-style.md` — meaning first, outcome first, evidence,
  fewer ideas
- `djenriquez-core:humanizer` after drafting if the prose still has AI tells

This skill is adapted from abatilo's post-STE split: full Simplified Technical
English as an always-on rule was too heavy and made models game word caps.
Craft stays here; thin reporting tone stays in `reporting-style.md`; AI voice
cleanup stays in humanizer.

## Collision rules

Where guidance collides, the reader's task decides:

| Text kind | Wins |
|-----------|------|
| Procedure, reference, how-to, migration, long follow-along doc | this skill |
| PR Summary / short reported work | `reporting-style.md` + humanizer `pr-body` |
| Review comment / short reply | humanizer `review-comment` / `pr-reply` (teammate voice) |
| Narrative essay / person-sounding prose | humanizer `general` |

Do not apply WARNING/CAUTION pageantry, fixed word-count caps, or a long
pre-response checklist. Those make models clip meaning.

## Sentences

- One primary topic per sentence. Write subject, verb, and object explicitly.
  A reader mid-step cannot reconstruct an implied actor.
- Active voice when the actor is known. Passive only when the actor is unknown
  or beside the point: "The scheduler starts the service" vs "The token is
  rotated hourly."
- Use "this" and other pronouns only when the referent is on the page. A
  referent that lives only in your session is the most common defect in
  generated docs.

## Words and terminology

- One name for one thing in every sentence, heading, and code sample. Repeat
  the name rather than varying it for style — two names read as two services.
- Prefer the repository's existing term when one exists.
- Prefer plain words over figurative or promotional ones.
- Unpack stacked nouns into a phrase with a verb and a preposition:
  prefer "handle exhaustion of the database connection pool" over
  "database connection pool exhaustion handler".
- Write a long term in full at first use, give its short form there, then use
  the short form. Introduce a specialized term before leaning on it.

## Procedures

- Write each instruction as a command.
- One instruction per sentence unless actions truly happen at once — so a
  reader who fails halfway still knows where they are.
- Put the condition before the command: "When the health check fails, restart
  the service." Acting on the verb before the condition is already wrong.
- Put the expected result immediately after the action that produces it.
- Number steps when order matters.
- When rewriting an existing procedure, keep its sequence; reordering breaks
  it silently.

## Lists

- Keep list items at one logical level.
- Keep instructions and description in separate lists so the reader can tell
  which items to perform.
- Turn a sentence that grew a long series of items into a vertical list.

## Notes and destructive steps

- A note is supporting information only. Anything the reader must do, avoid,
  or satisfy belongs in the procedure body — notes are the first thing skipped.
- Warn about a destructive step inside the step itself, in ordinary sentences
  and ordinary capitalization. Protective action first, then what is lost:
  "Back up the database before you run the migration, because the migration
  removes rows that do not match the new schema."

## After drafting

Run a surgical humanizer pass if the draft still has AI marketing, significance
inflation, or engineering AI-speak. Do not let humanizer impose narrative
"voice and soul" on a procedure. Re-check reporting-style: outcome first,
evidence only when verified, meaning preserved.
