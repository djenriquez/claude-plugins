# Spec Style Reference

Load this when authoring or rewriting a design spec. The `write-spec` skill owns the workflow; this file only governs structure and writing.

A spec has two audiences with opposite needs. Human reviewers skim it on a PR and need a narrative they can absorb in minutes. Implementing agents consume it later and need exhaustive, verified detail. Serve both by layering: a plain-language narrative on top, an implementation appendix at the bottom. Both layers are normative — the appendix binds the implementation exactly as much as the narrative does. Never delete implementer detail to make a spec readable — demote it.

## Structure

```markdown
# <Title>

**Status**: Draft
**Author**: <user> (with AI assistance)

## Summary

## Problem Statement

## Goals / Non-Goals

## Design

## Alternatives Considered

## Acceptance Criteria

## Rollout            (when deployment carries risk)

## Dependencies       (when ordering matters)

## Open Questions     (when any remain)

## Appendix: Implementation Notes
```

Everything above the appendix is the narrative layer. Adapt sections to the size of the work — a small fix may need only Problem Statement, Design, Acceptance Criteria, and a short appendix.

## The narrative layer

**Lead with the conclusion.** Every section opens with 1–3 sentences stating its takeaway before any detail. A reviewer who reads only the Summary plus the first paragraph of each section must come away with a correct mental model. Apply this skim test before publishing.

**Summary** is at most 120 words of plain language: the problem, the approach, and what changes for users or operators. No internal function, type, or service names — someone who has never opened the repository should understand it.

**Problem Statement** gives the failure or need, who it affects, and the evidence. Name at most the one or two components where the problem lives.

**Design** opens with the end-to-end story — what happens, in order, when the feature works. Then:

- Any flow with three or more actors, or four or more sequential steps, gets a Mermaid sequence or flow diagram instead of prose. GitHub renders Mermaid. Put the diagram first and the caveats after.
- Summarize the load-bearing choices in a key-decisions table: `Decision | Choice | Why`. Reviewers challenge decisions, not paragraphs.
- Each component subsection opens with what changes and why, in plain language, then the constraints that shaped it. Give each load-bearing constraint a short name at first statement (for example, "the argv-logging constraint") and cite that name from every design subsection it shapes — a constraint an implementer must honor may live in the appendix, but its name and consequence must appear where the design depends on it.

**Alternatives Considered** is one short paragraph per alternative: what it was and the single reason it lost.

## Budgets

- Summary: ≤ 120 words.
- Narrative layer: aim for under ~1,200 words; treat ~2,000 as the ceiling. A narrative that cannot fit is usually describing more than one spec's worth of work — split it or push detail into the appendix.
- The appendix has no budget.

## Code references and jargon

- In the narrative, reference at most the symbols where behavior actually changes — roughly two code references per paragraph. The exhaustive `file:line` inventory belongs in the appendix.
- Expand every acronym at first use, including internal ones. The team's shorthand is the reviewer's stumbling block.
- Prefer a system's role over its codename where the role is what matters: "the credential service" reads faster than an internal project name, though name it once so implementers can find it.

## The appendix

The appendix holds everything an implementer needs that a reviewer can skip: the verified `file:line` inventory of touched code, wire-format or schema definitions, exhaustive error and config mappings, and command transcripts. It is normative, not supplementary — an implementer must read it in full, and the spec should say so in the appendix's opening line. Rules:

- Wrap each appendix block in `<details><summary>…</summary>` so GitHub renders it collapsed.
- Use tables for enumerable mappings (error → handling, config → default).
- Keep entries verified — a `file:line` that drifts is worse than none. Note the commit or date the inventory was verified against.

## Prose

- Short sentences, simple verbs. "X is/does Y", not "X serves as Y" or "X is responsible for Y".
- State facts without inflating them: no "crucially", "importantly", "pivotal", or claims that a detail "underscores" something.
- No bolded-label bullet walls (`**Thing:** description` repeated). If the labels are parallel, use a table; otherwise write sentences.
- Don't force lists of three, and don't end sections with generic outlook statements.
- Sentence-case headings. At most one em dash per paragraph.
- Cut filler: "in order to" → "to", "has the ability to" → "can", "it is important to note that" → nothing.

## Final checklist

**The reviewer test.** Verify against the narrative layer alone:

1. What is broken or needed, and what is the evidence?
2. What is the approach, end to end?
3. What are the two or three key decisions, and what did each trade away?
4. What will exist when this is done, and how do we know it works?
5. If rollout carries risk: how does it deploy safely and roll back?

If any answer requires the appendix, move that answer up.

**The implementer test.** Verify against the whole document:

6. Every fact, constraint, and decision gathered while preparing the spec appears in the narrative or the appendix. The narrative budget is never met by dropping facts — compare the draft against the gathered context and place anything missing.
7. An agent holding only this document could implement without guessing or having to rediscover context.
8. Every named constraint is cited from each design subsection it shapes.

Then confirm the budgets hold and the prose rules pass. A humanizer-style editing skill, when installed, may run as a final surgical pass on the narrative layer only — it must not grow the word count or alter appendix precision.
