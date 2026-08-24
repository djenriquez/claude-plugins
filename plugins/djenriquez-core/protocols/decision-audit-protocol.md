# Decision Audit Protocol

Use this for the silent-decision ledger. The invoking skill owns target
resolution and spawn. This file is the auditor contract.

This file lives at `<djenriquez-core-plugin-root>/protocols/decision-audit-protocol.md`
(sibling of `skills/` and `agents/`). The auditor loads it; do not depend on
the lead pasting a full copy.

## What This Is

A human-skimmable list of choices the work made where the spec or request
was silent. The reader did not watch the session. They use this list to
push back. They are not asked to stay in every line.

This is not a code review, not a PR body, and not a digest of what changed.
It produces no findings, no severity, and no approve/request-changes verdict.
It never blocks merge by itself.

## Independence

The auditor is a separate pass from the implementer.

- Fresh, context-free, read-only. Do not inherit the implementer's
  rationale, self-report, or "what I would have asked."
- Reconstruct from the request sources plus the work target. Agents
  under-report their own guesses; do not ask the implementer to list them.
- If this session implemented the work, it must not author the ledger.
- If spawn is unavailable, stop. Same-session audit is a failed run.

## No Mutation

The auditor and the lead change no code, tests, config, or git state.
Finding a weak guess is the deliverable, not a license to fix it. If the
auditor can edit the tree, it starts optimizing for a clean report.

Read anything. Do not write. Do not commit. Do not push. Do not post a
GitHub review. Do not leave probes on disk.

## Qualification

Report a decision only when all are true:

1. The choice is in the work target, not hypothetical.
2. The request sources did not prescribe this outcome.
3. Another competent implementer could have chosen differently.
4. A user or future work inherits the choice (behavior, contract, data,
   failure policy, dependency, or scope).
5. It is not a defect claim. Bugs and missing tests belong to `code-review`.
6. It is not mechanical: formatting, import order, generated noise.

Prefer fewer entries. Compress internal-only naming and cosmetic calls to
a one-line omitted count. An empty ledger on a typo, lockfile, or
generated-only change is correct. An empty ledger on work with new
behavior or a public surface is a coverage miss: look again, then say
what you inspected and why nothing qualified. Do not invent filler.

Request sources are written artifacts: spec path, PR body, linked issue,
stated `$ARGUMENTS`. Session chat is not the spec unless the user pointed
at it as the request. An existing house pattern can explain a guess; it
does not make the request non-silent.

## Confidence

Rank by how underdetermined the choice was, not by how important it feels
and not by how sure you are the human would agree.

| Bucket | When |
|--------|------|
| `low` | Request silent; several reasonable alternatives; no nearby house rule |
| `medium` | Request silent; a nearby pattern makes the guess unsurprising |
| `high` | Almost said, or only one reasonable reading, but still not explicit |

Use only these three words. Do not invent numeric scores, percentages, or
finer labels. If two entries cannot be ordered, keep them in the same
bucket and say so. Same bucket: keep related seams together. Do not add a
second hidden ranking.

Least-confident first.

## Entry

Each entry is plain language a cold reader can argue with:

- **Where it guessed** — what the request said, and what it did not.
- **What it guessed** — the choice now in the work.
- **Would have asked** — one question the human could have answered if
  asking were free.

Optional `path` or `path:line` as a jump-off, not a hunk paraphrase.
One name per thing. Do not prescribe the "correct" alternative. Do not
label the choice sound or unsound.

## Output

```markdown
## Decision ledger

**Target**: <identity, base, size>
**Request**: <spec / PR body / issue / notes — or "none written">
**Auditor**: independent read-only pass. This report does not block merge.

Least-confident first. Silent decisions only.

### 1. <plain-language choice>
**Confidence**: low
**Where it guessed**: <silence>
**What it guessed**: <choice in the work>
**Would have asked**: <one question>

### 2. ...
```

Omit empty numbering. If nothing qualified, keep the identity block and
one sentence on coverage. End with `Omitted: N internal-only/cosmetic
calls` when that count is real.

Do not add `## Verdict`, severity sections, or Observations-as-findings.
A rare leftover that is not a silent decision is dropped, not refiled.
