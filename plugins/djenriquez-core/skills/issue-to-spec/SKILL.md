---
name: issue-to-spec
description: "Orchestrates the full investigation-to-spec workflow starting from a GitHub issue. Phase 1: explore the issue and codebase to build context. Phase 2: interview the user from a problem-solving perspective. Phase 3: author a spec and publish it to docs/specs/. Phase 4: assess complexity and conditionally launch the spec-review skill. Phase 5: harden the spec with review feedback."
argument-hint: "#N (GitHub issue number)"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Skill
  - AskUserQuestion
  - WebSearch
  - WebFetch
---

# Issue-to-Spec

Orchestrate a GitHub issue into a Ready spec. Target: `$ARGUMENTS` (`#N`, `N`,
or issue URL). Ask if missing.

Invoke sub-skills via the host. Do not reimplement `interview`, `write-spec`, or
`spec-review` when available.

## Invariants

- Confirm problem/context/open questions with the user before interviewing.
- Do not proceed past a user-reviewed draft until requested edits land.
- Trivial specs skip formal review; complex specs run `spec-review`.
- Incorporate agreed findings; disagreement gets a short Consideration Note, not
  silence. Critical disagreement warrants a thorough note or user check.
- Deliver with `**Status**: Ready`.

## Phases

1. **Explore** — `gh issue view` (+ comments / linked PRs). Map codebase touch
   points, existing patterns, and related docs. Present a short confirm summary
   (problem, affected areas, open questions).
2. **Interview** — Invoke `interview` grounded in that summary (fallback:
   `abatilo-core:interview`, then structured questions yourself). Cover design
   decisions, acceptance, edges, scope, deps, NFRs, rollout — probe until the
   spec can be written.
3. **Author** — Invoke `write-spec` with issue number/title for filename and
   `**Issue**: #<N>` (fallback: `references/spec-style.md`, plus structure
   standards when proposing new packages). Wait for user review.
4. **Complexity** — Complex if any of: new service/module, public/cross-team
   API, data model, security, multi-team coord, 3+ components/phases, production
   reliability, or large design surface. Trivial if all of: single module, no
   cross-team API/data/security risk, well-understood pattern, short design.
   State the assessment briefly.
5. **Review (complex only)** — Invoke `spec-review` on the file. Revise within
   `spec-style.md` layering. If the skill is unavailable, say so and continue
   with the current draft.
6. **Deliver** — Set Ready; report path, issue, complexity, review verdict (if
   any), and what changed from review vs consideration notes.
