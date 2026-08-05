# Feedback Disposition Fixtures

Expected outcomes for `protocols/feedback-disposition.md`. Use these when
triaging feedback or revising the protocol. Each fixture is a claim plus the
disposition the agent should reach.

## 1. Speculative concern, complex remedy → `NO CHANGE`

**Claim:** "This handler might race under load; add a distributed lock and a
retry queue."

**Evidence:** No reproducer, no failing test, no cited concurrency contract, and
no demonstrated race on a reachable path.

**Disposition:** `NO CHANGE`. Unsupported speculation stays `NO CHANGE` even
when the suggested remedy would cross the complexity gate.

## 2. Proven local bug → `FIX NOW`

**Claim:** "Nil dereference when `user` is absent on this new error path."

**Evidence:** The changed code shows a reachable path that dereferences `user`
after a nil check was removed; a unit test or local trace confirms it.

**Disposition:** `FIX NOW` with the smallest local guard or control-flow fix.
Do not add a new abstraction.

## 3. Proven bug needing a schema change → `NEEDS DECISION`

**Claim:** "Unique constraint is missing; duplicate rows corrupt billing."

**Evidence:** Reachable write path and a failing or clearly missing uniqueness
invariant in the changed contract.

**Disposition:** `NEEDS DECISION`. Do not classify as `NO CHANGE` because the
remedy is expensive, and do not add a migration without an explicit decision.

## 4. Medium-labeled concrete bug → elevate, then `FIX NOW`

**Claim:** Reviewer labels a clear authz bypass or data-loss path `Medium`.

**Evidence:** After revalidation, the path is reachable and violates a required
security or correctness contract introduced or exposed by the change. The
smallest remedy is local.

**Disposition:** Elevate to blocking, then `FIX NOW`. Reviewer severity labels
do not keep demonstrated correctness, security, data-loss, broken-contract, or
failing-verification issues in the Medium/Low bucket.

## 5. Large mechanical rename → soft size checkpoint, not hard gate

**Claim:** "Rename this internal helper across four production files."

**Evidence:** Owner-requested or clearly mechanical rename; no new interface,
schema, concurrency, or persistent-state mechanism.

**Disposition:** Soft size checkpoint before mutation. Ask whether to proceed as
mechanical work. Do not auto-classify as `NEEDS DECISION` from file or line
count alone.

## 6. Mixed round: independent fix plus gated design → partial progress

**Clusters:**

- A: proven local nil guard → `FIX NOW`
- B: optional cache for a bounded path with no measured regression → `NO CHANGE`
- C: proven invariant that needs a new background reconciler → `NEEDS DECISION`

**Disposition:** Implement and resolve A, reply and resolve B, present the
decision packet for C and leave C unresolved. Do not freeze A or B because C is
gated, and do not treat the round as complete while C remains open.
