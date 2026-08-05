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

## 2. Proven bug, delete beats patch → `FIX NOW` (remove/simplify)

**Claim:** "Nil dereference when `user` is absent on this new error path."

**Evidence:** The changed code shows a reachable path that dereferences `user`
after a nil check was removed; a unit test or local trace confirms it. The
nil path exists only because a dead branch still calls the helper.

**Disposition:** `FIX NOW` with remedy rank `remove/simplify` — delete or
narrow the dead branch so the helper is not called. Do not add a new guard
abstraction if removal restores the invariant.

## 3. Proven bug needing a schema change → `NEEDS DECISION`

**Claim:** "Unique constraint is missing; duplicate rows corrupt billing."

**Evidence:** Reachable write path and a failing or clearly missing uniqueness
invariant in the changed contract.

**Disposition:** `NEEDS DECISION`. Do not classify as `NO CHANGE` because the
remedy is expensive, and do not add a migration without an explicit decision.

## 4. Medium-labeled concrete bug → elevate, then ranked `FIX NOW`

**Claim:** Reviewer labels a clear authz bypass or data-loss path `Medium`.

**Evidence:** After revalidation, the path is reachable and violates a required
security or correctness contract introduced or exposed by the change. The
owning seam can enforce the check without a new mechanism.

**Disposition:** Elevate to blocking, then `FIX NOW` at the owning seam.
Reviewer severity labels do not keep demonstrated correctness, security,
data-loss, broken-contract, or failing-verification issues in the Medium/Low
bucket.

## 5. Large mechanical rename → soft size checkpoint, not hard gate

**Claim:** "Rename this internal helper across four production files."

**Evidence:** Owner-requested or clearly mechanical rename; no new interface,
schema, concurrency, or persistent-state mechanism.

**Disposition:** Soft size checkpoint before mutation. Ask whether to proceed as
mechanical work. Do not auto-classify as `NEEDS DECISION` from file or line
count alone.

## 6. Mixed round: independent fix plus gated design → partial progress

**Clusters:**

- A: proven bug on seam Auth → `FIX NOW` (remove/simplify)
- B: optional cache for a bounded path with no measured regression → `NO CHANGE`
- C: proven invariant on seam Billing that needs a new background reconciler →
  `NEEDS DECISION`

**Disposition:** Implement and resolve A, reply and resolve B, present the
decision packet for C and leave C unresolved. Do not freeze A or B because C is
gated. Do not land further Billing patches while C is open. Do not treat the
round as complete while C remains open.

## 7. Local patch only after seam options fail → `FIX NOW` (local)

**Claim:** "Missing timeout on this outbound call."

**Evidence:** Reachable new call path with no deadline; owning seam already has
the standard client helper, but wiring it requires a new interface on a shared
package.

**Disposition:** Prefer seam wiring if it stays inside the gate. If the only
correct seam fix widens a public/internal interface, use `NEEDS DECISION`. Use
`FIX NOW` with remedy rank `local` only when a call-site deadline restores the
invariant without a gated mechanism, and record why seam fix was impossible.

## 8. Second blocking finding on an already-fixed seam → `NEEDS DECISION`

**Context:** Turn 1 applied a local nil guard on seam Placement. Turn 2 finds
another reachable invariant break on the same placement path.

**Disposition:** `NEEDS DECISION`, not another `FIX NOW` local patch. Options
must include removing or simplifying the earlier fix and reshaping the owning
seam. Same-seam means the shared control-flow path, not only an identical file.

## 9. Findings cleared by adding mechanisms → not clean success

**Context:** Self-review or feedback round adds a wrapper, flag, and duplicated
validation. The latest review reports no Critical/High findings.

**Disposition:** Do not treat the run as clean. Report mechanism growth and
either justify each addition as the ranked remedy for a required invariant or
stop for a decision / blocked state.
