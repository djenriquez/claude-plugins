# Code Cleanliness Standards

Three non-negotiable patterns for code written by `self-review-loop`. Read by the orchestrator before applying fixes (Step 2e) and by the cleanliness agent during the per-turn review (Step 2f).

Findings are **blocking**: every violation is addressed or explicitly justified under "When NOT to fix". Readability concerns outside these three patterns belong to the main code review, not here. Use judgment when a situation doesn't map cleanly — principles matter more than thresholds.

---

## Pattern 1 — No Duplication

**Why.** Divergent copies silently drift; duplicated logic has no single name for readers to anchor on.

**Flag when:**
- Three or more call sites share substantially the same shape with small variance (values, types, method names)
- The shared logic has one nameable responsibility
- What they share is larger than what differs

**Don't fix when:**
- Only two call sites — indirection costs more than one duplicated block
- Similar shape but unrelated domains (billing vs. inventory) — extraction leaks concerns
- Extraction needs 5+ parameters or a `mode` flag — the call sites weren't really the same
- Three short lines — premature DRY

**Example:**

```
# Before: three handlers repeat the same parse-and-validate
def create_user(req):
    body = json.loads(req.body)
    if "email" not in body: return error(400, "missing email")
    if not valid_email(body["email"]): return error(400, "bad email")
    ...
# update_user, invite_user: identical first three lines

# After
def parse_email_body(req):
    body = json.loads(req.body)
    if "email" not in body: return None, error(400, "missing email")
    if not valid_email(body["email"]): return None, error(400, "bad email")
    return body, None
```

---

## Pattern 2 — Return Early

**Why.** Indentation signals importance. Guard clauses handle edge cases up front so the happy path stays at the outermost level.

**Flag when:**
- Nesting exceeds 2 levels within a function (each `if`/`for`/`while`/`try` counts)
- An `if` whose body is 80%+ of the function, `else` holds a small early exit
- Sequential `if`s acting as guards — flatten into a guard sequence
- Final meaningful statement lives at indent level 4+ without good reason

**Don't fix when:**
- Both branches are equal-weight business logic (not edge-case plus main-case)
- Language requires single-exit for cleanup and no scope-guard idiom exists (`defer`, `with`, `using`, `try/finally`)
- Function is small enough that inversion adds no readability

**Example:**

```
# Before: happy path buried four deep
def process(order):
    if order is not None:
        if order.is_valid():
            if order.items:
                if order.customer.is_active:
                    total = compute_total(order)
                    ...

# After: guards up front, happy path at level 1
def process(order):
    if order is None: return error("no order")
    if not order.is_valid(): return error("invalid order")
    if not order.items: return error("empty order")
    if not order.customer.is_active: return error("inactive customer")
    total = compute_total(order)
    ...
```

---

## Pattern 3 — Atomic Functions

**Why.** One function, one responsibility. Long multi-phase functions couple unrelated concerns and resist testing.

**Flag when:**
- Name requires "and" to describe it accurately ("parse and validate and transform")
- Body exceeds roughly one screen (~40 lines soft ceiling; complexity is the real signal)
- Contains visually distinct phases (blank-line separators, `# step N` comments, non-overlapping variable scopes)
- Takes 5+ parameters
- Mixes I/O with pure logic (fetch + parse + compute + persist in one function)

**Don't fix when:**
- Linear and straightforward, just long (e.g., field-by-field config setup)
- Splitting would thread 6+ parameters through each helper — fix the shape instead
- Helper would have one call site and a name that adds no information
- Performance-critical hot path where inlining matters

**Example:**

```
# Before: one function, four phases (read / parse / dedupe / persist)
def run_import(path):
    with open(path) as f: raw = f.read()
    # ... 30+ lines parsing, deduping, writing ...

# After
def run_import(path):
    raw = read_file(path)
    records = parse_records(raw)
    deduped = dedupe_by_email(records)
    persist_users(deduped)
    return len(deduped)
```

Each helper is independently testable; the orchestrator reads like an outline.

---

## Cleanliness Agent Output Format

```
## Cleanliness Review

### Findings
1. **[pattern]** `file:line-range` — <one-sentence description>
   Fix: <one-sentence direction>

2. **[pattern]** `file:line-range` — ...

(or "No findings" if the diff is clean)

### Summary
<N findings across P patterns>
```

`[pattern]` is one of: `duplication`, `deep-nesting`, `long-function`. The orchestrator uses `file:line-range` plus the fix direction to apply changes without re-deriving what to do.
