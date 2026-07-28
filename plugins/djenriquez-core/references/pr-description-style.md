# PR Description Style Reference

Load this when drafting or revising a non-trivial pull request body. The `pr-publish` skill owns when to publish; this file only governs structure. Load `references/reporting-style.md` for tone (outcome first, meaning before plainness, fewer ideas, verified claims only). Run `djenriquez-core:humanizer` in `pr-body` mode before publish.

## Shape

Use this order:

1. `## Summary`
2. `## What changed`
3. `## Details`
4. `## Test plan`

Keep the top skimmable and the lower sections useful for reviewers.

## Summary

Write two short paragraphs:

1. Explain the user-visible problem and root cause in plain language. Avoid internal function names and type names here.
2. State the outcome this PR creates.

Good summaries are understandable to someone who has not opened the repository. The first sentence should state the problem or outcome in plain language — not agent shorthand like `Fixed: X → Y → green`. After drafting the full body, run the required `djenriquez-core:humanizer` pass in `pr-body` mode. The Summary is the main skim target: if it still sounds like AI marketing or implementation soup, rewrite it again.

## What Changed

Lead with the primary fix. If the PR includes secondary cleanup or hardening, separate it under a clear label such as `Related hardening`.

Do not narrate commit-by-commit. Group by behavior or reviewer concern.

## Details

Include only subsections that earn their space:

- `Root cause`: specific files, functions, data paths, or evidence.
- `How it's fixed`: grouped by mechanism or theme.
- `Before vs. after`: a table only when there are at least two distinct scenarios.

Reference implementation symbols here, not in the summary.

## Test Plan

Use checkboxes:

```markdown
- [x] Local/unit/CI checks already run
- [ ] Concrete post-deploy or manual validation still pending
```

Every unchecked item must be runnable by a reviewer or operator. Avoid vague entries such as `monitor prod`.

## Rules

- Never force-push to publish a PR.
- Never enumerate commits in the PR body.
- Distinguish the primary fix from secondary hardening.
- Cite evidence for bug fixes when evidence exists.
- Write in post-merge present tense: `The runner now...`.
- Do not add emoji unless recent project PRs use them.
- If a before/after table would repeat the same failure mode, omit it.
- Avoid engineering AI-speak (`leverages`, `streamlines`, `ensures`, `robust`, `seamless`, `comprehensive`, `aligns with best practices`). Prefer concrete mechanisms and outcomes. See `references/humanizer-patterns.md`.
- Brevity means fewer ideas, not compressed fragments. Claim tests/builds only when evidence exists.
