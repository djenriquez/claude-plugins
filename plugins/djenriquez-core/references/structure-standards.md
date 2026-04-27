# Code Structure Standards

Five patterns for how code is organized into packages and modules. Read by:
- `/issue-to-spec` during spec authoring (Step 3b.5) — validates proposed package layout before code is written
- `/spec-review`'s `structure-reviewer` agent — challenges structural decisions in the spec
- `/self-review-loop`'s structural pass — catches drift when a turn's edits move package boundaries

Findings carry one of two severities. **Blocking** when the spec or diff *introduces* a new package or module that violates the pattern — restructure before the shape sets. **Advisory** when modifying existing structure — recorded for follow-up but doesn't gate progress. The calling skill provides the new-vs-existing context.

The bar is "the alternative is concretely better," not "could be organized differently." Use judgment — principles matter more than thresholds.

For Go projects, also load `structure-standards-go.md`.

---

## Pattern 1 — One Responsibility Per Package

**Why.** A package's name is a contract for what's inside. When the contract requires "and" to describe accurately, every reader has to learn the full surface before they know where to look.

**Flag when:**
- Package name or description requires "and" to be accurate (`admin and auth and audit`)
- Package mixes unrelated nameable concerns
- Name is a generic catch-all: `utils`, `helpers`, `common`, `shared`, `lib`, `misc`
- A subset of files could lift into a new package and stand alone with a clean name

**Don't fix when:**
- The concerns are genuinely entangled — separating leaks shared state across the boundary
- Package is small and the "second responsibility" is one helper with no other home yet
- The "second responsibility" is a low-level primitive used everywhere in the package

**Example:**

```
# Before — admin/ mixes user CRUD, role checks, audit logging
admin/
  users.go         # admin user CRUD
  permissions.go   # role and scope checks
  audit.go         # audit logging
  middleware.go    # ties them together for HTTP

# After — three focused packages, one composer
adminusers/        # user CRUD
adminauthz/        # role and scope checks
adminaudit/        # audit logging
adminhttp/         # composes the three for HTTP handlers
```

---

## Pattern 2 — High Internal Cohesion

**Why.** A package's files should reference each other. Two clusters that never call into each other are two packages forced to share a directory.

**Flag when:**
- A file's exported symbols aren't called by any other file in the same package
- Two distinct file clusters exist where files inside each cluster reference each other but the clusters don't cross-reference
- Adding a feature to one cluster doesn't require reading or touching the other

**Don't fix when:**
- The "cluster" is a single utility file used as glue (e.g., `errors.go`) — uni-directional dependencies are fine
- The lack of cross-reference reflects internal layering of one responsibility (`parser.go` → `ast.go`)
- Both clusters depend on the same package-private state that would be expensive to share

**Example:**

```
# Before — pricing.go/discount.go and stock.go/reservation.go never cross-reference
inventory/
  pricing.go      # references discount.go only
  discount.go     # references pricing.go only
  stock.go        # references reservation.go only
  reservation.go  # references stock.go only

# After — clusters become packages
inventory/pricing/
inventory/stock/
```

---

## Pattern 3 — Minimal Public Surface

**Why.** Every exported symbol is a maintenance commitment. The narrower the surface, the freer the implementation. Exporting "in case someone needs it" teaches consumers patterns the maintainer didn't intend.

**Flag when:**
- Exported symbols outnumber the symbols actually consumed by callers (verify with grep)
- Internal types appear in exported function signatures, leaking implementation shape
- Helpers are exported because they sit alongside exported ones, not because anyone imports them
- Tests reach into the package's internals from another package when an unexported test helper would suffice

**Don't fix when:**
- The export is genuinely consumed (verifiable across the codebase)
- The export is a documented public-API guarantee
- The package is a deliberate library with extension points

**Example:**

```
# Before — every type and helper is exported just in case
type Invoice         # consumed externally — keep
type LineItem        # consumed externally — keep
type Calculator      # only used inside this package
func ComputeSubtotal # only used inside this package

# After
type Invoice
type LineItem
type calculator      # unexported
func computeSubtotal # unexported
```

---

## Pattern 4 — Layered Separation

**Why.** I/O and pure domain logic have different failure modes, test strategies, and reasons-to-change. Mixing them at the package level forces every domain test to mock I/O and every domain refactor to wade through HTTP or SQL.

**Flag when:**
- Package mixes any two of: HTTP/RPC handlers, database access, file I/O, external API calls, pure domain rules, persistence schemas
- Domain functions take database connections or HTTP requests as parameters
- Tests for the domain require spinning up a database or HTTP server
- Changing the storage backend would require editing files containing business rules

**Don't fix when:**
- The package is intentionally thin (a CLI subcommand orchestrating pre-built primitives)
- Splitting would create a cycle with no shared abstraction available
- The "I/O" is in-process and inseparable from the logic that owns it (an embedded cache)

**Example:**

```
# Before — billing mixes domain rules, HTTP, SQL
billing/
  invoice.go    # domain: line items, totals, tax rules
  handler.go    # HTTP: parses requests, writes responses
  store.go      # SQL: read/write invoices

# After — layers split, domain has no I/O dependencies
billing/         # pure domain
billinghttp/     # depends on billing
billingdb/       # depends on billing
```

Domain is testable without HTTP or a database.

---

## Pattern 5 — Acyclic and Encapsulated Boundaries

**Why.** Cycles between packages mean the boundary is fictional — neither package compiles or reasons alone. Internal types crossing into another package's public API mean the encapsulation is fictional too.

**Flag when:**
- Two packages import each other (direct or transitive cycle)
- A package's exported function returns or accepts a type marked or named as internal (`internal/`, leading underscore, lowercase-only conventions)
- A type defined in package A is constructed only by package B — it belongs in B
- A package "owns" a type that another package mutates by reaching into its fields

**Don't fix when:**
- The shared dependency is a small, stable interface package designed to break the cycle (canonical fix, not a smell)
- The "leaking" type is a well-known external library type passing through unchanged
- The cycle exists in test files only and production code is acyclic

**Example:**

```
# Before — auth and users import each other
auth/   imports users  (to load user records)
users/  imports auth   (to check write permissions)

# After — extract the shared contract
userid/  defines UserID; depends on nothing
auth/    depends on userid
users/   depends on userid, auth
```

The cycle dissolves; both packages depend on a smaller, more stable contract.

---

## Structure Agent Output Format

```
## Structure Review

### Findings
1. **<pattern name>** `path/` — <one-sentence description>
   Severity: blocking | advisory
   Fix: <one-sentence direction>

2. **<pattern name>** `path/` — ...

(or "No findings" if the structure is sound)

### Summary
<short take>
```

Name the pattern in plain English (responsibility, cohesion, surface, layering, boundaries — or whatever fits the finding). The orchestrator keys on `path/` and severity to decide which findings gate the turn vs. record for follow-up.
