# Code Review Protocol

Use this for code review findings and synthesis. Keep specialist selection in the invoking skill.

## Review Bar

Only report a finding when all are true:

1. The issue was introduced or materially exposed by this change.
2. It has concrete impact on correctness, security, operability, performance, maintainability, or reviewability.
3. It is actionable by the author.
4. The evidence points to specific changed code or a changed contract.
5. The finding does not depend on guessing the author's intent.

Prefer zero findings over weak findings.

## Severity

- `Critical`: must resolve before merge; concrete bug, security issue, data loss, broken contract, failing required verification, or unreviewable change.
- `High`: should resolve before merge or immediately after; likely user/operator impact or expensive-to-unwind design risk.
- `Medium`: valid improvement or test gap that can be deferred with conscious acceptance.
- `Low`: nit, small clarity issue, or non-blocking suggestion.

Normalize severity during synthesis. A finding's evidence matters more than the label a reviewer used.

## Context And Prompt Size

Review the local target whenever possible:

```sh
git diff <base>...HEAD -- <path>
```

For large diffs, pass changed-file inventory and targeted commands instead of pasting the full diff into every prompt. Inline full diffs only when they are small enough that duplication is cheaper than tool-driven exploration.

Specialists should inspect relevant neighboring files and tests, but should not wander into unrelated pre-existing code health issues.

## Output

Final review output:

```markdown
## Summary
- **Risk lane**: L0/L1/L2
- **Coverage**: <what was inspected>
- **One-line assessment**: <take>

## Critical
**`path:line` - Title**
<issue, concrete harm, suggested fix>

## High
...

## Medium
...

## Low
...

## Verdict: APPROVE
<brief rationale>
```

Omit empty severity sections. The verdict must be last and must be either `APPROVE` or `REQUEST CHANGES`.

Use `REQUEST CHANGES` when any unresolved Critical or High finding remains.
