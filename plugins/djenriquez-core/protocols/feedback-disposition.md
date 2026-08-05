# Feedback Disposition Protocol

Use this protocol when review feedback can cause code changes. The goal is to
reduce total correctness risk and implementation complexity, not to maximize
the number of comments converted into code or findings cleared.

## Contents

- [Evaluate Three Independent Axes](#evaluate-three-independent-axes)
- [Choose A Disposition](#choose-a-disposition)
- [Rank The Remedy](#rank-the-remedy)
- [Apply The Complexity Gate](#apply-the-complexity-gate)
- [Progress Independent Clusters](#progress-independent-clusters)
- [Stop Same-Seam Patching](#stop-same-seam-patching)
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
- the owning seam (package, module, API, or lifecycle boundary where the
  invariant should hold)
- the ranked remedy options below
- mechanisms the chosen remedy adds, widens, or removes
- every original thread or finding covered by the cluster

Generic design prose is not evidence of a defect. Explicit user,
repository-owner, or code-owner direction is evidence of the desired design,
but it does not authorize an unbounded scope or new production mechanisms.

## Choose A Disposition

Use one of these outcomes for each cluster:

- `FIX NOW`: The change introduced or materially exposed a reachable violation
  of a required invariant or contract, a regression, or a material security,
  data-loss, or operability risk. The chosen remedy is remove/simplify or a
  seam-level fix that stays inside the complexity gate, or a local patch only
  after the ranked menu rules it in.
- `NO CHANGE`: The concern is false, unsupported, pre-existing, subjective,
  superseded, or an optional bounded improvement whose demonstrated benefit
  does not justify its cost.
- `NEEDS DECISION`: The concern may be valid, but its resolution changes the
  design or scope, crosses the complexity gate, or needs an approach decision
  after same-seam escalation.

Do not classify a proven violation of a required invariant as `NO CHANGE`
because its remedy is expensive. Use `NEEDS DECISION`.

An explicit user, repository-owner, or code-owner request may also be `FIX NOW`
when it is contract-neutral, local, and simplifying. Treat it as non-blocking,
and apply the complexity gate before accepting it.

## Rank The Remedy

Before mutating a `FIX NOW` cluster, rank these options and record the choice:

1. **Remove or simplify** existing code so the invariant holds without a new
   branch, helper, flag, wrapper, or cache.
2. **Fix at the owning seam** where the contract should be enforced, even if
   that touches more than the finding's file/line, as long as it stays inside
   the complexity gate.
3. **Local patch** at the finding site only when (1) and (2) are impossible
   without crossing the complexity gate. State why.

Prefer (1), then (2), then (3). Do not choose (3) because it is faster to type.
If (1) or (2) would cross the complexity gate or reopen the PR's approach, use
`NEEDS DECISION` and include revert-or-reshape of the approach as an option.

A `FIX NOW` edit that only adds defensive branches, duplicated validation, or
adapters around a wrong design is a failed ranking. Stop and reclassify.

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
and any cluster that shares its owning seam, remedy, or files. Independent
`FIX NOW` clusters on other seams may still be implemented, verified,
committed, and resolved. Independent conclusive `NO CHANGE` clusters may still
be replied to and resolved.

Do not land more patches on a seam that already has an open `NEEDS DECISION`,
even if a later finding looks locally fixable. Present every gated decision
packet before or alongside progress on other seams. Do not treat a round as
complete while any `NEEDS DECISION` cluster remains open.

Explicit preauthorization for a named design change satisfies the gated
checkpoint; invoking a feedback-handling workflow does not.

## Stop Same-Seam Patching

Track the owning seam for every applied fix in the current operation or
self-review run.

If a later blocking finding lands on a seam that already received a fix in this
operation or run, do not apply another local patch. Reclassify as
`NEEDS DECISION` with options that include:

- remove or simplify the earlier fix and the underlying approach
- reshape the owning seam
- accept a narrowly scoped local patch with an explicit owner decision

Same-seam means the same package/module boundary, API surface, lifecycle hook,
or shared control-flow path — not only an identical file path. When unsure,
treat overlapping production files or caller/callee pairs as the same seam.

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

Clearing findings while adding mechanisms is not success. If the operation or
self-review run adds or widens mechanisms, either justify each addition as the
ranked remedy that restores a required invariant, or stop for a decision before
calling the work clean.

## Keep Triage Compact

Show one line for each `FIX NOW` and `NO CHANGE` cluster, including the remedy
rank chosen (`remove/simplify`, `seam`, or `local`). Show the full evidence,
options, and mechanism packet only for `NEEDS DECISION`, unless the user asks
for more detail.

Cluster by root cause, but keep a mapping from every original thread or finding
to its cluster. In each reply, state how the cluster disposition resolves that
specific concern.

## Fixtures

Use `references/feedback-disposition-fixtures.md` as the expected-disposition
corpus when checking or revising this protocol. Prefer those fixtures over
improvising new edge-case rules.
