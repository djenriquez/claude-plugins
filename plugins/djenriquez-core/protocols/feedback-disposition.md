# Feedback Disposition Protocol

Use this protocol when review feedback can cause code changes. The goal is to
reduce total correctness risk and implementation complexity, not to maximize
the number of comments converted into code.

## Contents

- [Evaluate Three Independent Axes](#evaluate-three-independent-axes)
- [Choose A Disposition](#choose-a-disposition)
- [Apply The Complexity Gate](#apply-the-complexity-gate)
- [Keep Tests At Stable Seams](#keep-tests-at-stable-seams)
- [Require Performance Evidence](#require-performance-evidence)
- [Report Change Growth](#report-change-growth)
- [Keep Triage Compact](#keep-triage-compact)

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

Use `NEEDS DECISION` when a proposed remedy adds or widens any of these:

- source API, schema, or generated-code contracts
- indexes, migrations, or the generation pipeline
- public or internal interfaces
- locks, transactions, concurrency, or ordering guarantees
- retries, background work, recovery protocols, caches, or persistent state
- dynamic query or batching machinery
- control flow spanning multiple components

Also use `NEEDS DECISION` when a remedy adds more than 50 non-test lines or
touches more than three production files unless the change is demonstrably
mechanical. Do not split a change to evade the gate.

Count generated artifacts separately. Regenerated output does not trigger the
gate by itself when it follows an already-approved local contract fix. Changes
to the source contract or generation pipeline do trigger the gate.

When any cluster is `NEEDS DECISION`, pause the entire mutation phase. Do not
edit files, commit, push, reply, or resolve threads until the user decides.
Explicit preauthorization for a named design change satisfies this checkpoint;
invoking a feedback-handling workflow does not.

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
does not prove that the change is simpler. If the implemented diff crosses the
complexity gate, stop before commit or push and reclassify the cluster as
`NEEDS DECISION`.

## Keep Triage Compact

Show one line for each `FIX NOW` and `NO CHANGE` cluster. Show the full evidence,
options, and mechanism packet only for `NEEDS DECISION`, unless the user asks for
more detail.

Cluster by root cause, but keep a mapping from every original thread or finding
to its cluster. In each reply, state how the cluster disposition resolves that
specific concern.
