---
name: interview
description: "Interview users to turn an issue, rough plan, or implementation idea into spec-ready decisions. Use when the user asks to interview/probe/question a plan, when issue-to-spec needs design clarification, or before writing a spec that depends on product, technical, rollout, or scope decisions."
argument-hint: "(optional) plan, issue summary, or open questions"
disable-model-invocation: false
allowed-tools:
  - Read
  - AskUserQuestion
---

# Interview

Interview from a solution-design perspective. Use `$ARGUMENTS` and conversation context as the subject. If the subject is unclear, ask what plan, issue, or decision set to interview.

## Principles

- Ask only questions that can materially change the spec, implementation plan, scope, or risk profile.
- Prefer 1-3 related questions per round.
- Probe assumptions, failure modes, edge cases, tradeoffs, and non-goals.
- Do not chase exhaustive certainty; stop when the remaining unknowns can be written as explicit open questions or assumptions.

## Flow

1. Briefly restate the current goal, known constraints, likely design direction, and highest-risk unknowns.
2. Ask the first round with the host's structured question capability when available. If not available, ask concise plain-text questions.
3. After each answer, probe only where the response exposes a blocker, contradiction, high-impact tradeoff, or missing acceptance criterion.
4. Cover the areas that matter for this subject:
   - outcome and success criteria
   - affected users and workflows
   - design choices and rejected alternatives
   - edge cases, error handling, and rollback
   - data, API, security, performance, or operational concerns
   - dependencies, ordering, rollout, and explicit non-goals
5. Finish with a decision summary:
   - decisions made
   - assumptions accepted
   - open questions or deferred risks
   - acceptance-criteria seeds

The summary should be directly usable by `write-spec`, `issue-to-spec`, or a human author writing the next spec draft.
