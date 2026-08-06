# Review Protocol

This protocol governs all specialist reviewers. Follow it exactly.

This file lives at `<djenriquez-core-plugin-root>/protocols/review-protocol.md`
(sibling of `skills/` and `agents/`). Specialists load it themselves; do not
depend on the lead pasting a full copy.

## Review Phases

**Phase 1 — Specialist Review + Self-Critique**
Conduct your domain-specific review. Then rigorously self-critique your findings (L1/L2 only — skip for L0). Return Phase 1 findings as your final response body (see Output).

**Phase 2 — Cross-Review**
Harness-dependent:

- **Persistent team harness (Claude Code teams):** after returning Phase 1
  findings, remain available. The lead may route challenges via `SendMessage`.
  Respond substantively; do not exit on your own while the team is active.
- **One-shot Task harness (Cursor, many Codex spawns):** end after Phase 1.
  If the lead needs a challenge round, it will spawn a follow-up task with the
  disputed finding(s). Treat that follow-up as Phase 2 and respond in the new
  task’s final response.

## Comment Taxonomy

Classify every finding:

| Label | Meaning | Blocking? |
|-------|---------|-----------|
| blocker | Must resolve before implementation/merge. Cite concrete harm. | Yes |
| risk | Gap or failure mode to consciously accept. | Discuss |
| question | Seeking clarification, not suggesting change. | No |
| suggestion | Concrete alternative with rationale. | No |
| nitpick | Minor wording or formatting preference. | No |
| thought | Observation or consideration, not a request. | No |

### Priority

Assign a priority to every finding:

| Priority | Meaning |
|----------|---------|
| P0 | Cannot proceed without resolving this. |
| P1 | Should be resolved before implementation/merge starts. |
| P2 | Should be resolved eventually, can start. |
| P3 | Nice to have. Minor improvement. |

Format: `[taxonomy-label/P0-P3] Section/file:line — Description`. For blockers/risks, describe the harm scenario. For suggestions, provide a concrete alternative.

## Comment Framing

- Questions over statements: "What happens when X?" NOT "This is wrong"
- Personal perspective: "I find this unclear because..." NOT "This is unclear"
- Focus on the content, not the author: "This section does X" NOT "You forgot X"
- No diminishing language: never "simply," "just," "obviously," "clearly"
- Brief: at most 1 paragraph body per finding
- Clearly state the scenario or condition where the issue matters
- Communicate severity honestly — don't overclaim
- Written so the author grasps the issue immediately

## Finding Qualification

Only flag an issue if ALL of these hold:

1. Is this a real gap, or is it intentionally left to implementation?
2. Would addressing this change the meaning or scope?
3. Is this actionable by the author?
4. Does this concern apply to the content being reviewed (not a pre-existing issue)?

Additionally:
5. Discrete and actionable — not a general concern or vague feeling
6. Meaningfully impacts correctness, feasibility, clarity, or operability
7. The author would likely address it if made aware

Quantity guidance:
- Output ALL qualifying findings — don't stop at the first
- If nothing qualifies, output zero findings

## Self-Critique (L1/L2 only — skip entirely for L0)

After your specialist review, stress-test your own findings before sending them.

### Process

For each finding, ask yourself:
1. **Am I certain this is actually wrong/missing?** Could the author have intentionally made this choice? Is it covered elsewhere?
2. **Is this the right level of concern?** Am I asking for something that belongs in a different artifact (implementation, testing, operational docs)?
3. **Would a reasonable senior engineer agree this matters?** Or am I being pedantic?
4. **Is my severity calibrated?** Am I calling something a blocker that's really a suggestion?
5. **Do I have a concrete suggestion?** If not, can I at least frame a specific question?

### Self-Critique Anti-Patterns

- Don't weaken valid findings through excessive self-doubt
- Don't add findings just to seem thorough
- Don't upgrade severity to seem rigorous
- Don't keep a finding you can't defend — withdraw it

After self-critique, note which findings were strengthened, modified, or withdrawn.

## Cross-Review

When Phase 2 runs (same session or follow-up spawn), the lead may send:

- **A challenge**: Another specialist's finding for you to evaluate from your domain. Respond with agreement, disagreement, or nuance the original agent missed. Cite evidence from the content.
- **A defense request**: Another specialist has challenged your finding. Defend with evidence or concede if the challenge has merit. Don't defend for ego — defend for correctness.
- **An elaboration request**: Provide more detail on a specific finding.

Respond to all cross-review requests promptly and substantively.

## Output

After Phase 1 (specialist review + self-critique when applicable), deliver
findings to the lead as your **final response body**. If Claude Code team tools
are available, you may also `SendMessage` the same payload — that is optional
and must not be the only deliverable in one-shot harnesses.

Structure:

1. **Findings list** — Each finding includes:
   - Classification (taxonomy label + priority, e.g. `blocker/P0`)
   - Section or `file:line` reference
   - Description (concrete gap/issue, suggested fix or rewrite)
   - Agent stance: "must fix" or "can defer", with 1-sentence rationale
   - Self-critique status (L1/L2 only): "confirmed" / "modified" / "withdrawn" with brief note
2. **Overall assessment** — "ready" or "needs revision". Ready = clear enough and complete enough to proceed without significant risk of rework.

After Phase 1 in a one-shot harness, exit normally. In a persistent team harness,
remain available for Phase 2 until the lead shuts the team down.
