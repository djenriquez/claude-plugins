# PR Description Style Reference

Load this when drafting or revising a pull request body. The `pr-publish` skill owns when to publish; this file governs structure. Load `references/reporting-style.md` for tone and apply `skills/humanizer/SKILL.md` in `pr-body` mode before publish.

## Shape

Use this order, omitting optional sections that add no new information:

1. `## Summary`
2. Reviewer figure (`![title](url)` — not a heading; produced by `pr-figure`)
3. `## What changed` (optional)
4. `## Details` (optional)
5. `## Test plan`

For a small change, Summary and Test plan may be enough. Preserve any sections
required by the repository's PR template. Each section should add information
at a useful level of detail, not repeat the same claim in different words.

## Summary

Explain what changes and why in a short paragraph. Add a second paragraph when
the problem needs separate context. Avoid internal function and type names;
include the root cause only when it helps explain the outcome.

Good summaries are understandable to someone who has not opened the repository. The first sentence should state the problem or outcome in plain language — not agent shorthand like `Fixed: X → Y → green`. After drafting the full body, run the required `djenriquez-core:humanizer` pass in `pr-body` mode. The Summary is the main skim target: if it still sounds like AI marketing or implementation soup, rewrite it again.

Write each Summary paragraph as a **single unbroken line**. Do not hard-wrap prose for terminal width — GitHub soft-wraps. Blank lines between paragraphs are fine; lists and fenced code keep their structure.

After the Summary paragraphs, embed the reviewer figure when `pr-figure` produced one (`![title](url)`). See `skills/pr-figure/SKILL.md` and `references/pr-figure.md`. A reviewer who reads only Summary plus the figure should understand the change.

## What Changed

Use this section when distinct changes need explanation beyond the Summary.
Lead with the primary fix; distinguish secondary cleanup when relevant.

Group by behavior or reviewer concern. Mention files when they help locate a
change; do not inventory every touched file or narrate commits.

## Details

Include only subsections that earn their space:

- `Root cause`: specific files, functions, data paths, or evidence.
- `How it's fixed`: grouped by mechanism or theme.
- `Before vs. after`: a table only when there are at least two distinct scenarios.
- Non-obvious decisions, compatibility changes, or material risks a reviewer
  needs to assess. Omit generic claims that a change is low risk.

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
- Never hard-wrap prose paragraphs (especially Summary): one paragraph, one line.
- Distinguish the primary fix from secondary hardening.
- Cite evidence for bug fixes when evidence exists.
- Write in post-merge present tense: `The runner now...`.
- Compare only with behavior on the base branch. Earlier drafts and review
  rounds do not belong in the description of the final change.
- Do not add emoji unless recent project PRs use them.
- If a before/after table would repeat the same failure mode, omit it.
- Avoid engineering AI-speak (`leverages`, `streamlines`, `ensures`, `robust`, `seamless`, `comprehensive`, `aligns with best practices`). Prefer concrete mechanisms and outcomes. See `references/humanizer-patterns.md`.
- Brevity means fewer ideas, not compressed fragments. Claim tests/builds only when evidence exists.
