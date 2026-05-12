# Go Code Health Standard

This document defines the working standard for incremental cleanup in Go codebases. It is not a full style guide. It is a review and refactor contract for keeping code understandable, testable, and safe to change.

Use this standard during development and review. It is advisory by default: prefer shaping new or touched code well up front, and surface concerns as review comments when cleanup is worthwhile but not required for the current change. Do not rewrite unrelated working code solely to satisfy this standard.

Escalate a finding only when it identifies concrete harm: correctness risk, unclear ownership introduced by the change, discarded errors, goroutine lifecycle leaks, impossible testing, or a package boundary that will become expensive to unwind.

## Reference Baseline

Use these references when a code-health question is ambiguous. Effective Go and Go Code Review Comments are the default; Google and Uber are supporting production references when this document is silent.

- [Effective Go](https://go.dev/doc/effective_go) and [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments)
- [Package names](https://go.dev/blog/package-names)
- [Errors are values](https://go.dev/blog/errors-are-values)
- [Google Go Style Guide](https://google.github.io/styleguide/go/)
- [Uber Go Style Guide](https://github.com/uber-go/guide)

## Standards

- Prefer clarity over cleverness. The reader should be able to identify the domain decision being made without reconstructing the whole call graph.
- Use return-early control flow. Validate inputs and failed preconditions at the top, return immediately on errors, and keep the normal path out of `else` blocks after terminal branches.
- Refactor by behavior-preserving slices: characterize current behavior with tests, move code, then simplify.
- Extract ownership, not aesthetics. A new package should own a domain concept, dependency boundary, or lifecycle. Do not create packages just because a file is large.
- Avoid generic dumping grounds. Packages named `common`, `util`, `helpers`, or `misc` need a specific justification and should usually become domain-named packages instead.
- Keep interfaces on the consumer side. Return concrete types from implementing packages unless an abstraction is already needed by a caller.
- Treat concurrency lifecycle as part of the API. Every goroutine should have an obvious exit path, usually through `context.Context`, channel close ownership, or documented process lifetime.
- Split functions when they mix validation, authorization, persistence, remote calls, response shaping, and logging in one flow. There is no hard line-count rule.
- Extract named helpers for domain decisions, not for arbitrary blocks of code.
- Pass only the data a helper needs. Avoid passing a large service receiver when the helper only needs a repository, clock, logger, or request field.
- Keep error handling explicit. Do not discard errors. Add context at the boundary where it helps an operator or caller act.
- Avoid logging and returning the same error unless both audiences need the event.

## Package Extraction

Package boundaries should make ownership visible. Filename grouping such as `gateway_start.go` or `runner_service.go` is acceptable, but it is not a substitute for package ownership when a root package accumulates unrelated responsibilities.

Extract a package when at least two of these are true:

- The code has a distinct domain vocabulary, such as routing, certificates, streaming sessions, placement, or join tokens.
- The code has a narrow dependency set that can be separated from the parent service.
- The code can be tested through a small public API.
- Multiple files mutate the same state machine or lifecycle and reviewers need a local boundary to reason about it.
- The package name would be short, lower-case, and meaningful at call sites.

Do not extract a package when the result would be a bag of unrelated helpers, when it would create import cycles, or when the only benefit is shrinking a file.

## Incremental Refactor Protocol

Use this protocol for cleanup PRs and for feature PRs that touch unhealthy code:

1. Identify the behavior that must not change.
2. Add or confirm focused tests around that behavior.
3. Make one mechanical move or extraction at a time.
4. Run the narrow package tests after each meaningful step.
5. Simplify control flow only after the move is covered.
6. Keep the PR title and description honest: "refactor", "extract", or "move" should mean behavior-preserving.

If a cleanup needs behavior changes, split it into a separate PR or call that out explicitly in the description and tests.

## Review Checklist

- Does every changed line support the stated cleanup or feature?
- Does the code return early for invalid inputs, failed preconditions, and errors instead of nesting the normal path?
- Are package names and exported names meaningful together at call sites?
- Are errors handled, wrapped, or classified at the right boundary?
- Are goroutine lifetimes and context propagation clear?
- Did tests cover the behavior before and after movement?
- Did the PR avoid unrelated formatting, renaming, and opportunistic rewrites?
