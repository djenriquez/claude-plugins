# State Machines Reference

Load this when a workflow needs to judge state: authoring a spec that
introduces a lifecycle, reviewing a spec or a diff that changes one, or
auditing a codebase for lifecycles that were never named. The invoking skill
owns the workflow; this file owns the shared definition, the test for when an
implicit machine is acceptable, and the dispositions every workflow uses.

This file lives at `<djenriquez-core-plugin-root>/references/state-machines.md`,
sibling to `skills/` — not under any one skill.

## What counts

A state machine here is any piece of state whose meaning changes over time:
a lifecycle, a phase, a status, a retry or cancellation flow, a connection
or assignment that moves through stages.

A machine is **explicit** when its states are named in one place, its allowed
transitions are stated, and changes go through a guard or a single mutator
that can reject an invalid transition.

A machine is **implicit** when the same lifecycle is encoded in a way a
reader has to reconstruct, for example:

- a cluster of booleans or string values that jointly encode the state, so
  combinations exist that no state in the lifecycle corresponds to
- nil-ness or presence of a field or handle encoding a phase
- a counter or timestamp mutated from many sites, where the count is the
  state (retry budgets, generation numbers)
- one field doing two lifecycle jobs — for example a creation-time input
  that a later step overwrites with the resolved value it records, so the
  first write silently changes what later reads mean
- state persisted in more than one copy, with restore or cleanup rules
  implemented separately in each copy
- a status consumed by a switch or a set of conditionals with no fallback,
  so an unrecognized value falls through silently
- transitions that happen with time alone, with no write, log, or event —
  eligibility or health that changes because a date passed

Not every boolean is a machine, and not every machine is a problem:

- A predicate that answers a question about current data (`isEmpty`,
  `hasPermission`) is derived state, not a lifecycle.
- A two-value flag that is set once and only read afterwards is a record,
  not a machine.
- A lifecycle already held in a typed enum with an exhaustive consumer is
  explicit enough for most purposes, even without a framework.

## When implicit is acceptable

Implicit is the right default for small, contained lifecycles. Making every
lifecycle a formal machine is its own complexity cost, and the burden of
proof is on the formal version. An implicit machine is acceptable when all
of these hold:

1. Few states (two or three), moving mostly in one direction, with no
   cycles, retries, timeouts, or cancellation paths branching back in.
2. One owner of every mutation: a local variable, a single function, or
   methods on one owning type serialized behind one lock or guard.
3. Not persisted. The state dies with the process, so nothing has to be
   restored or reconciled after a crash or restart.
4. Impossible combinations, if the encoding allows any, are harmless and
   reversible — cosmetic, not financial, security, or data consequences.
5. An unexpected value fails visibly — an error, a log, a rejected call —
   instead of falling through silently.
6. No other component makes decisions from this state. It is an
   implementation detail, not a contract other code depends on.

## Hard triggers

Any one of these ends the acceptable case, whatever the other answers are:

- Four or more states, or any cycle, retry, timeout, or cancellation path
- Mutations with no single owner: more than one file or goroutine mutating
  the state, or mutations scattered across many call sites with no guard in
  front of them. Methods on one owning type serialized behind one lock or
  guard are one owner
- The state is persisted, restored, or held in more than one copy
- The encoding represents combinations that contradict each other, and the
  contradiction can occur on a path that moves money, grants access,
  decides eligibility, or loses or corrupts data
- An unrecognized value falls through silently — a switch with no fallback,
  string comparisons with asymmetric matching, a consumer that hangs or
  no-ops on a value it does not know
- The state changes with time alone, with no write, log, or event recording
  that it changed
- Other components read the state to make their own decisions, so the
  encoding is a contract whether it was declared as one or not

## Scoring axes

Judge each machine on these axes. Use them to reach a disposition; do not
turn them into a numeric score.

| Axis | Lower concern | Higher concern |
|------|---------------|----------------|
| States | 2–3, linear | 4+, cycles or branches back |
| Writers | One place | Many sites, files, or goroutines |
| Persistence | Process-local | Persisted, restored, or copied |
| Concurrency | Synchronous, single owner | Async, callbacks, racing writers |
| Impossible states | None, or harmless | Representable and harmful |
| Blast radius | Local, reversible | Money, auth, eligibility, data loss |
| Change rate | Stable, rarely touched | New states or readers keep arriving |

## Dispositions

Every machine a workflow reports gets exactly one disposition. A list
without dispositions is a backlog, not a result. When more than one could
fit, take the first that applies: `DELETE`, then `ACT`, then `ACCEPT`, then
`CONTAIN`.

### ACT — make it explicit

A hard trigger is present and the harm is concrete. The report for an ACT
entry is spec-ready:

- the inferred states and the transitions between them, including the
  invalid ones the current code allows
- the encoding and every writer site found
- one concrete harm scenario: the input, state, or timing that reaches the
  bad combination or the missing transition
- the owning seam where the explicit machine should live
- the suggested shape — named states, a transition table or guard, a single
  mutator — and how to verify the change (which existing tests cover the
  lifecycle, what transition test is missing)

### CONTAIN — keep the shape, add the cheap guard

No hard trigger with concrete harm, but a guard is missing that costs little:
name the lifecycle in a comment or type, replace a bool or string cluster
with a typed enum, route mutations through one function, add the missing
fallback so an unknown value fails visibly, log transitions, or add a test
for the one transition that matters. State the exact guard proposed; "keep
an eye on it" is not a containment.

### ACCEPT — leave it implicit, on the record

The acceptable case holds. An ACCEPT entry records:

- why it is acceptable, in terms of the criteria above
- a **revisit trigger**: an observable change that would end the acceptance,
  stated so a later diff can be checked against it — a second writer
  appears, the state gets persisted, a fourth state is added, the state
  starts feeding a money, auth, or eligibility decision, a reader in
  another package appears

An acceptance without a revisit trigger is an omission, not a decision.

### DELETE — remove it instead

The machine lives in dead, frozen, or deprecated code, or in state that
duplicates another source of truth. The right move is to remove that code
or state, not to build a formal machine into it. The entry names what to
delete and what any remaining reader uses instead, or points to the tracked
removal that already covers it. If the removal is not going to happen,
score the machine again — frozen is a fact about the code's future, not a
permanent exemption.

## Where an audit lives

An audit lives in the session that ran it and writes no files. Its scope is
whatever was asked — the whole codebase, a path, or one pull request — and
its entries hold only for that scope. Reviews do not reuse an audit: the
state-machine check in `djenriquez-core:code-review` derives dispositions
from the diff, its `ACT`, `CONTAIN`, and `DELETE` entries that meet the
review bar become that review's findings, and `/publish-review` posts them
like any other finding. `ACCEPT` entries are not findings and are not
posted. An `ACT` finding takes its severity from the design-defect rule in
`protocols/code-review-protocol.md`: rate the unguarded transition by the
state it reaches, not by how often its trigger fires.

## Qualification bar

Report a machine only when the evidence shows:

1. The encoding sites — the fields, flags, or values that jointly hold the
   state, with file references.
2. The inferred states — named by the auditor, marked as inferred when the
   code never names them.
3. At least one writer and, for `ACT` or `CONTAIN`, the transition or
   combination that makes the disposition necessary; for `DELETE`, what
   shows the code is dead, frozen, or deprecated, or which source of truth
   the state duplicates.

Do not report a machine from a name alone ("this is called Status, so it
must be a lifecycle") without reading how the value is written and read.
Do not report the same machine once per file it touches; one entry per
lifecycle, with every site listed under it.
