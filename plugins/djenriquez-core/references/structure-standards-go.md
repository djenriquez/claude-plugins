# Code Structure Standards — Go Addendum

Additional patterns for Go projects. Apply *in addition to* the language-agnostic patterns in `structure-standards.md`. Detect Go projects by the presence of `go.mod` at the repo root.

Go's package model has constraints that shape design:
- Package = directory; the directory's last segment is the import path
- Lowercase identifiers are unexported — the language enforces encapsulation if you let it
- Cycles are a compile error, so the cyclic-deps half of Pattern 5 is enforced by the compiler

These shape the patterns below.

---

## Go Pattern 1 — Package Name Is a Noun for What It Provides

**Why.** Idiomatic Go invokes exports through the package name: `bytes.Buffer`, `http.Server`, `time.Duration`. The package name appears at every call site, so it should describe *what the package provides*, not *what kind of code lives in it*.

**Flag when:**
- Package name ends in `manager`, `service`, `handler`, `helper`, `util` (e.g., `usermanager`, `authservice`)
- Caller writes `usermanager.UserManager{}` — stuttering signals a name not pulling its weight
- Package name is a verb or verb phrase

**Don't fix when:**
- The suffix is part of a domain term (`paymentprocessor` where "processor" is the actual noun)
- The name is an established convention (`httptest`, `iotest`)

**Example:**

```go
// Before
import "myapp/usermanager"
um := usermanager.New()
u := um.GetUser(id)

// After
import "myapp/users"
u := users.Get(id)
```

---

## Go Pattern 2 — Define Interfaces at the Consumer

**Why.** Go interfaces are satisfied implicitly. The consumer of a behavior is best-positioned to declare the minimal interface it needs. Bundling interfaces with concrete implementations forces every consumer to depend on the implementer's package.

**Flag when:**
- A package exports both concrete type `T` and interface `T`er that mirrors `T`'s methods
- An interface in package A is implemented only in A and consumed only in B — it belongs in B
- Tests in package A define a mock for an interface declared in A; usually the interface should move to the consumer

**Don't fix when:**
- The interface has multiple implementations across the codebase (genuinely shared)
- The interface is a deliberate plugin contract or extension point

---

## Go Pattern 3 — Use `internal/` to Make Encapsulation a Compile Error

**Why.** `internal/` is the only way Go enforces package privacy across module boundaries. Code under `internal/` cannot be imported from outside the parent. Use it to make encapsulation a compile error, not a code review.

**Flag when:**
- A package is consumed by exactly one parent and its descendants but lives outside `internal/`
- An exported type is documented "internal — do not use" but is exported anyway
- `pkg/` is used as the default catch-all for "library-ish" code without external-reuse intent — `internal/` is usually correct

**Don't fix when:**
- The package is genuinely intended for external import (it's a library)
- Moving to `internal/` would break legitimate external consumers

---

## Go Pattern 4 — `internal/` Is Not a Grab-Bag

**Why.** Moving code to `internal/` solves visibility, not organization. Pattern 1 still applies inside `internal/`.

**Flag when:**
- `internal/` contains packages named `utils`, `common`, `shared`, `helpers`, `lib`
- `internal/` accumulates many packages with no clear sub-grouping
- A package was moved to `internal/` to fix an export problem without rethinking what it does

**Don't fix when:**
- The `internal/` package is a single, focused, well-named package — visibility was the only thing that changed
