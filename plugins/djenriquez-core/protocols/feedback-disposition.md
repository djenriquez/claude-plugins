# Feedback Disposition Protocol

Use this protocol when review feedback can cause code changes. The goal is to
reduce total correctness risk and implementation complexity, not to maximize
the number of comments converted into code.

## Contents

- [Evaluate Three Independent Axes](#evaluate-three-independent-axes)
- [Choose A Disposition](#choose-a-disposition)
- [Apply The Complexity Gate](#apply-the-complexity-gate)
- [Progress Independent Clusters](#progress-independent-clusters)
- [Keep Tests At Stable Seams](#keep-tests-at-stable-seams)
- [Require Performance Evidence](#require-performance-evidence)
- [Report Change Growth](#report-change-growth)
- [Keep Triage Compact](#keep-triage-compact)
- [Fixtures](#fixtures)

## Evaluate Three Independent Axes

- **Severity** is the impact if the concern is true.
- **Evidence** is demonstrated or reachable, rather than plausible or
  speculative.
- **Change cost** is local or simplifying, rather than mechanism-expanding.

A severity label does not substitute for evidence. No severity bypasses the
complexity gate.

For each root-cause cluster, record:

- the exact contract, specification, test, or explicit owner decision at stake
- a reachable call path, reproducer, failing verification, or reason the path
  must be reachable
- the impact and normalized severity
- the smallest known remedy
- mechanisms the remedy adds, widens, or removes
- every original thread or finding covered by the cluster

Generic design prose is not evidence of a defect. Explicit user,
repository-owner, or code-owner direction is evidence of the desired design,
but it does not authorize an unbounded scope or new production mechanisms.

## Choose A Disposition

Use one of these outcomes for each cluster:

- `FIX NOW`: The change introduced or materially exposed a reachable violation
  of a required invariant or contract, a regression, or a material security,
  data-loss, or operability risk. The smallest remedy is local or simplifying.
- `NO CHANGE`: The concern is false, unsupported, pre-existing, subjective,
  superseded, or an optional bounded improvement whose demonstrated benefit
  does not justify its cost.
- `NEEDS DECISION`: The concern may be valid, but its resolution changes the
  design or scope, or crosses the complexity gate.

Do not classify a proven violation of a required invariant as `NO CHANGE`
because its remedy is expensive. Use `NEEDS DECISION`.

An explicit user, repository-owner, or code-owner request may also be `FIX NOW`
when it is contract-neutral, local, and simplifying. Treat it as non-blocking,
and apply the complexity gate before accepting it.

## Apply The Complexity Gate

Apply this gate only after the concern meets the evidence bar or an authorized
owner explicitly requests the design change. Do not escalate unsupported
speculation solely because its suggested remedy is complex; use `NO CHANGE`.

Use `NEEDS DECISION` when a proposed remedy adds or widens any of these
mechanisms:

- source API, schema, or generated-code contracts
- indexes, migrations, or the generation pipeline
- public or internal interfaces
- locks, transactions, concurrency, or ordering guarantees
- retries, background work, recovery protocols, caches, or persistent state
- dynamic query or batching machinery
- control flow spanning multiple components

Size alone does not force `NEEDS DECISION`. If a remedy stays inside the
mechanism list above but looks large — roughly more than 50 non-test lines or
more than three production files — report that size as a soft checkpoint before
mutation. Ask whether to proceed, treat it as mechanical, or reclassify. Do not
split a change to evade scrutiny. Demonstrably mechanical edits (renames,
import fixes, or regenerated output after an already-approved contract fix)
may proceed without that checkpoint.

Count generated artifacts separately. Regenerated output does not trigger the
hard gate by itself when it follows an already-approved local contract fix.
Changes to the source contract or generation pipeline do trigger the hard gate.

## Progress Independent Clusters

`NEEDS DECISION` pauses mutation, reply, and resolve only for the gated cluster
and any cluster that shares its remedy or files. Independent `FIX NOW` clusters
may still be implemented, verified, committed, and resolved. Independent
conclusive `NO CHANGE` clusters may still be replied to and resolved.

Present every gated decision packet before or alongside that progress so the
user can decide without waiting for the round to finish. Do not treat a round
as complete while any `NEEDS DECISION` cluster remains open.

Explicit preauthorization for a named design change satisfies the gated
checkpoint; invoking a feedback-handling workflow does not.

## Keep Tests At Stable Seams

Treat missing coverage as `FIX NOW` only when the change affects a load-bearing
invariant that lacks stable-seam coverage. Test the contract or observable
behavior. Do not mirror incidental branches, and do not add a production
mechanism solely to make a test possible.

## Require Performance Evidence

Treat a performance concern as actionable only when evidence shows at least one
of these:

- a change-introduced unbounded or asymptotic path
- a measured regression from a benchmark, profile, or query plan
- a violated workload, service-level, or production constraint

Default existing bounded behavior and small constant-factor concerns to
`NO CHANGE` without that evidence. A proven performance concern still crosses
the complexity gate when its remedy adds a gated mechanism.

## Report Change Growth

Before committing, report additions and deletions for both the current operation
and the total pull request. Split each range into:

- production
- tests
- migrations and schema
- generated artifacts
- documentation

Use repository conventions to classify paths. Count ambiguous paths as
production. Use `git diff --numstat <start-sha>` for the current operation and
`git diff --numstat <pr-base-sha>` for the total pull request so uncommitted
changes are included.

List mechanisms added, widened, and removed for each range. A net line reduction
does not prove that the change is simpler. If the implemented diff adds or
widens a gated mechanism, stop before commit or push for that cluster and
reclassify it as `NEEDS DECISION`. If it is only large by the soft size signal,
report the growth and ask before commit.

## Keep Triage Compact

Show one line for each `FIX NOW` and `NO CHANGE` cluster. Show the full evidence,
options, and mechanism packet only for `NEEDS DECISION`, unless the user asks for
more detail.

Cluster by root cause, but keep a mapping from every original thread or finding
to its cluster. In each reply, state how the cluster disposition resolves that
specific concern.

## Fixtures

Use `references/feedback-disposition-fixtures.md` as the expected-disposition
corpus when checking or revising this protocol. Prefer those fixtures over
improvising new edge-case rules.
