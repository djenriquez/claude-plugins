# Code Cleanliness Standards

This document defines three non-negotiable patterns for code written by the `self-review-loop` skill. It is used in two places:

- The orchestrator reads it before applying fixes (Step 2e) so the code it writes avoids these patterns up front
- The cleanliness agent reads it during the cleanliness pass (Step 2f) to detect violations in the diff produced this turn

Findings against these standards are **blocking** — the turn does not complete until every flagged violation is either addressed or explicitly justified (see "When NOT to fix" under each pattern). Preference-level readability concerns outside these three patterns are out of scope; leave those to the main code review.

Each pattern below states **why** it matters, **how to detect** it, **when not to apply** it, and shows a before/after sketch. The principles are more important than the thresholds — use judgment when a concrete situation doesn't map cleanly.

---

## Pattern 1 — No Duplication (extract helpers honestly)

### Why

Duplication multiplies cost. Every divergent copy is a silent bug waiting to happen: a change that lands in one copy but not the others produces behavior that differs between call sites, and the drift is often invisible in review. Duplication also fragments the reader's mental model — they have to scan N near-identical blocks and diff them visually to understand what varies. When the shared logic has a name, that name becomes the single place future readers look.

### How to detect

The cleanliness agent should flag duplication when:

- **Three or more call sites** share substantially the same shape, with differences limited to a small number of values, types, or method names
- The shared logic has a **single, nameable responsibility** (e.g., "validate request headers", "convert record to DTO", "retry with exponential backoff")
- The variance between copies is **smaller than** what they share
- Extraction would reduce total line count or flatten the mental model

### When NOT to fix

- **Only two call sites.** The cost of an extra indirection exceeds the cost of one duplicated block. Come back when the third appears.
- **Superficial similarity, different domains.** Two functions that both iterate and transform but belong to genuinely different concepts (billing vs inventory) should stay separate. The "shared" helper would leak domain concerns across boundaries.
- **Extraction requires many parameters or branching flags.** If the helper ends up taking 5+ arguments or a `mode` flag to handle variance, the call sites weren't actually doing the same thing. Leave them inline.
- **Three short lines.** Premature DRY. Three clear repeated lines beat one clever abstraction.

### Example

Before (three near-identical handlers):
```
def create_user(req):
    body = json.loads(req.body)
    if "email" not in body: return error(400, "missing email")
    if not valid_email(body["email"]): return error(400, "bad email")
    ...

def update_user(req):
    body = json.loads(req.body)
    if "email" not in body: return error(400, "missing email")
    if not valid_email(body["email"]): return error(400, "bad email")
    ...

def invite_user(req):
    body = json.loads(req.body)
    if "email" not in body: return error(400, "missing email")
    if not valid_email(body["email"]): return error(400, "bad email")
    ...
```

After:
```
def parse_email_body(req):
    body = json.loads(req.body)
    if "email" not in body: return None, error(400, "missing email")
    if not valid_email(body["email"]): return None, error(400, "bad email")
    return body, None

def create_user(req):
    body, err = parse_email_body(req)
    if err: return err
    ...
```

---

## Pattern 2 — Return Early (flatten the happy path)

### Why

Deep nesting buries intent. When the main logic of a function lives four indents deep, the reader has to carry the state of every open conditional — what's true, what's been ruled out, what cleanup is still pending — just to understand what happens in the normal case. The happy path is the most important part of the function, and indentation is the visual cue that tells readers "this is the core." Guard clauses handle the edge cases up front and then step out of the way.

### How to detect

Flag a return-early violation when:

- **Nesting exceeds 2 levels** within a function (counting each `if`/`for`/`while`/`try` as a level)
- An `if` whose body is **80%+ of the function**, with `else` handling a small early-exit case
- **Sequential `if`s that together form guards**: validation, resource checks, feature flags — these should be flat guard clauses at the top, not nested
- A function where the final meaningful statement is at indent level 4 or deeper with no compelling reason

### When NOT to fix

- **Branches of equal weight.** If both sides of an `if` represent real business logic (not an edge case plus a main case), inverting creates an asymmetry that hides intent.
- **Single-exit required for cleanup.** Some languages/frameworks require a single return point for resource cleanup and inverting would duplicate that cleanup. Prefer idiomatic scope guards (`defer`, `with`, `using`, `try/finally`) first — only retain the nested form if no such construct exists.
- **Small function with one branch.** A 6-line function with one `if/else` doesn't benefit from inversion. The readability win requires enough function body to matter.

### Example

Before (nested four deep):
```
def process(order):
    if order is not None:
        if order.is_valid():
            if order.items:
                if order.customer.is_active:
                    total = compute_total(order)
                    charge(order.customer, total)
                    return total
                else:
                    return error("inactive customer")
            else:
                return error("empty order")
        else:
            return error("invalid order")
    else:
        return error("no order")
```

After (guards up front, happy path at level 1):
```
def process(order):
    if order is None: return error("no order")
    if not order.is_valid(): return error("invalid order")
    if not order.items: return error("empty order")
    if not order.customer.is_active: return error("inactive customer")

    total = compute_total(order)
    charge(order.customer, total)
    return total
```

---

## Pattern 3 — Atomic Functions (one verb, one screen)

### Why

Long functions couple unrelated concerns, making changes risky: a fix to one section has to navigate every other section to be confident nothing else breaks. They also obscure control flow — by the time the reader is at line 80, they've forgotten the setup at line 10. They resist unit testing because the only testable unit is the whole thing. A function that fits on one editor screen and does one nameable thing is the default unit of understanding.

### How to detect

Flag an atomic-function violation when:

- The function **cannot be named in a short verb phrase without "and"** (e.g., "parse, validate, and transform the request" is three functions)
- Its body spans **more than roughly one editor screen** (~40 lines as a soft ceiling; complexity, not raw length, is the real signal)
- It contains **visually distinct phases** — separated by blank lines, comments like `# step 2`, or variable scopes that don't overlap — that could each be named
- The function takes **5+ parameters** (strong hint that it's aggregating multiple responsibilities)
- The function **mixes I/O with pure logic** (fetching, parsing, computing, formatting, writing — each is a candidate boundary)

### When NOT to fix

- **Linear, straightforward, just long.** Some functions legitimately consist of one sequence of statements that don't benefit from extraction. A 50-line function that sets up a complex config object field-by-field is fine; splitting it just creates N one-line helpers.
- **Splitting would thread state awkwardly.** If every helper would need 6+ parameters, you're trading one long function for a family of leaky ones. Fix the shape, not the length.
- **Single call site with no naming value.** Extracting a helper that's called from exactly one place and whose name adds no information ("helper_step_2") is pure noise.
- **Performance-critical hot paths** where inlining matters — but this is a rare exception, not the default.

### Example

Before (one function, four phases):
```
def run_import(path):
    # phase 1: read file
    with open(path) as f: raw = f.read()
    lines = raw.splitlines()

    # phase 2: parse and validate rows
    records = []
    for line in lines:
        parts = line.split(",")
        if len(parts) != 5: continue
        records.append({
            "id": parts[0].strip(),
            "name": parts[1].strip(),
            "email": parts[2].strip().lower(),
            "created": parse_date(parts[3]),
            "active": parts[4].strip().lower() == "true",
        })

    # phase 3: dedupe by email
    seen = set()
    deduped = []
    for r in records:
        if r["email"] in seen: continue
        seen.add(r["email"])
        deduped.append(r)

    # phase 4: persist
    with transaction():
        for r in deduped: db.upsert("users", r)
    return len(deduped)
```

After (orchestrator + named phases):
```
def run_import(path):
    raw = read_file(path)
    records = parse_records(raw)
    deduped = dedupe_by_email(records)
    persist_users(deduped)
    return len(deduped)
```

Each helper is now independently testable and its name tells the reader what the phase does.

---

## Cleanliness Agent Output Format

When the cleanliness agent completes its review, it returns findings in this structure:

```
## Cleanliness Review

### Findings

1. **[pattern]** `file:line-range` — <one-sentence description>
   Fix: <one-sentence direction — "extract helper named X", "invert guards at line N", "split at phase boundaries">

2. **[pattern]** `file:line-range` — ...

(or "No findings" if the diff is clean)

### Summary
<N findings across P patterns>
```

Where `[pattern]` is one of: `duplication`, `deep-nesting`, `long-function`.

The orchestrator uses `file:line-range` and the fix direction to apply changes without re-deriving what to do.
