---
name: issue-to-spec
description: "Orchestrates the full investigation-to-spec workflow starting from a GitHub issue. Phase 1: explore the issue and codebase to build context. Phase 2: interview the user from a problem-solving perspective. Phase 3: author a spec and publish it to docs/specs/. Phase 4: assess complexity and conditionally launch /spec-review. Phase 5: harden the spec with review feedback."
argument-hint: "#N (GitHub issue number)"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Skill
  - AskUserQuestion
  - WebSearch
  - WebFetch
---

# Issue-to-Spec Workflow

You are an orchestrator that takes a GitHub issue and produces a hardened spec ready for implementation. You drive the entire workflow yourself — no agent teams.

Your workflow:
1. Gather and explore the issue
2. Interview the user to fill gaps
3. Author and publish a spec
4. Assess complexity
5. Conditionally run /spec-review to harden the spec
6. Incorporate feedback and deliver the final spec

The target issue is: $ARGUMENTS

If $ARGUMENTS is empty, ask the user which GitHub issue to work from.

---

## Step 1: Explore the Issue and Build Context

### 1a. Retrieve the issue

`$ARGUMENTS` should be a GitHub issue reference. Accepted formats:

- **`#N`** or **`N`** (issue number): e.g., `#42` or `42`
- **GitHub issue URL**: e.g., `https://github.com/owner/repo/issues/42` — extract the issue number from the URL path

Any other format is not supported. If the argument doesn't match these patterns, ask the user to provide a GitHub issue number.

Retrieve the issue:

```
gh issue view <N>
```

Read the issue body, title, labels, and assignees. Then pull comments for discussion context:

```
gh api repos/{owner}/{repo}/issues/<N>/comments
```

Check for linked PRs — if any exist, pull their diffs as implementation context.

### 1b. Explore the codebase

Using the issue as your guide, explore the relevant parts of the codebase:

- Use `Glob` and `Grep` to find files, modules, and APIs related to the issue
- Read key files to understand the current architecture and conventions
- Identify existing patterns, data models, and interfaces that the solution must integrate with
- Look for existing specs or design docs in `docs/` that provide architectural context

### 1c. Synthesize understanding

Build a clear mental model of:
- **The problem**: What is broken, missing, or requested?
- **The context**: What existing system does this touch? What constraints exist?
- **The scope**: What is the likely boundary of changes needed?
- **Open questions**: What is unclear or underspecified in the issue?

Present a brief summary of your understanding to the user before proceeding. This summary should cover the problem, the affected system areas, and the open questions you've identified. Ask the user to confirm or correct your understanding.

---

## Step 2: Interview the User

### Perspective shift

Switch from an investigator perspective to a **solution designer** perspective. You now understand the problem and codebase — your job is to design the solution collaboratively with the user.

### Interview topics

The interview should focus on:

- **Design decisions** the spec must capture (approach, tradeoffs chosen, alternatives rejected)
- **Acceptance criteria** — what does "done" look like?
- **Edge cases and error handling** — what happens when things go wrong?
- **Scope boundaries** — what is explicitly in and out of scope?
- **Dependencies and ordering** — what must happen first? Are there blockers?
- **Non-functional requirements** — performance, security, observability, backwards compatibility
- **Migration and rollout concerns** — feature flags, phased rollout, data migrations

### Launch the interview

Before starting the interview, provide a context preamble so the interview is grounded in what you learned in Step 1. Frame the interview around the specific open questions, design decisions, and ambiguities you identified.

**Primary path**: Invoke the `/interview` skill (requires the `abatilo-core` plugin). The `/interview` skill takes no arguments — it reads the current conversation context. Before invoking it, ensure the conversation contains your Step 1 summary (problem statement, affected system areas, open questions, and design decisions needed). This grounds the interview in the right context.

The `/interview` skill conducts a structured, in-depth interview using `AskUserQuestion` and produces a summary of decisions when complete.

> **Note on sub-skill permissions**: `/interview` and `/spec-review` run as independent skill invocations with their own `allowed-tools`. They are not constrained by this skill's tool list.

**Fallback**: If `/interview` is not available (skill invocation fails or the user does not have `abatilo-core` installed), conduct the interview yourself using `AskUserQuestion` directly. Follow this process:

1. Review the open questions and ambiguities from Step 1
2. Group them into rounds of 1-3 related questions using `AskUserQuestion`
3. For each answer, dig deeper — don't accept surface-level responses. Probe for edge cases, failure modes, and unstated assumptions
4. Continue until all interview topics above are covered and you have enough detail to write a complete spec
5. Summarize the full set of decisions and answers back to the user for confirmation

### After the interview

Review the summary for completeness. If critical areas were not covered, ask targeted follow-up questions directly (without re-invoking the skill).

---

## Step 3: Author the Spec

### 3a. Determine the spec filename

Derive a descriptive, kebab-case filename from the issue title:
- Strip issue number prefixes, special characters
- Lowercase, replace spaces with hyphens
- Keep it concise but descriptive (3-6 words)
- Example: issue "Add retry logic to webhook delivery" -> `webhook-delivery-retries.md`

### 3b. Write the spec

Author a comprehensive spec at `docs/specs/<filename>.md` that synthesizes everything from the issue exploration and interview. The `Write` tool creates parent directories automatically, so `docs/specs/` will be created if it doesn't exist. The spec must be a standalone document — a reader who hasn't seen the issue or interview should understand the full picture.

#### Spec structure

```markdown
# <Title>

**Issue**: #<N>
**Status**: Draft
**Author**: <user> (with AI assistance)

## Problem Statement

What is the problem? Why does it matter? Who is affected?

## Context

Relevant background about the current system, architecture, and constraints.
Reference specific files, modules, or APIs where appropriate.

## Goals

What this spec aims to achieve. Bulleted list of concrete outcomes.

## Non-Goals

What is explicitly out of scope and why.

## Design

### Overview

High-level description of the approach.

### Detailed Design

The technical design. This is the core of the spec.
Include subsections as needed for different components or phases.

### Alternatives Considered

Other approaches that were evaluated and why they were rejected.

## Acceptance Criteria

Testable conditions that define "done". Each criterion should be verifiable.

## Dependencies

External dependencies, ordering constraints, or prerequisite work.

## Rollout Plan

How this will be deployed. Feature flags, phased rollout, migration steps.

## Open Questions

Any remaining questions or decisions that need resolution.
```

Adapt this structure to the specific problem — not every section is needed for every spec. Small bug fixes may only need Problem Statement, Context, Design, and Acceptance Criteria. Large features may need all sections plus additional ones.

### 3c. Present the spec

After writing the spec file, present the full spec to the user. Ask them to review it and flag anything that needs adjustment. Make any requested changes before proceeding.

---

## Step 4: Assess Complexity

Evaluate the spec's complexity to determine whether it warrants a formal spec review.

### Complexity criteria

Consider the spec **complex** if ANY of the following are true:

- Introduces a new service, module, or major subsystem
- Changes a public or cross-team API
- Involves data model or schema changes
- Has security implications (auth, encryption, access control)
- Requires coordination across multiple teams or systems
- Has 3 or more distinct components or phases
- Affects production reliability (SLOs, failure modes, rollback)
- The spec is longer than ~500 words of design content

Consider the spec **trivial** if ALL of the following are true:

- Self-contained change within a single module
- No API changes visible to other teams
- No data model changes
- No security implications
- Straightforward implementation with well-understood patterns
- The spec is short and the design section is under ~300 words

### Declare the assessment

State your complexity assessment and the reasoning to the user:

```
**Complexity Assessment**: Complex / Trivial

**Reasoning**: [2-3 sentences explaining why]
```

If **trivial**: tell the user the spec will be finalized as-is (skip to Step 6 — write the final spec).

If **complex**: tell the user you will now run `/spec-review` to harden the spec, then proceed to Step 5.

---

## Step 5: Spec Review (Complex Specs Only)

**Skip this step entirely for trivial specs.**

### 5a. Launch spec review

**Primary path**: Invoke the `/spec-review` skill, passing the spec file path:

```
/spec-review docs/specs/<filename>.md
```

Wait for the review to complete. The review will produce findings organized by priority tier (Critical, High, Medium, Low) and a verdict (APPROVED or REVISIONS NEEDED).

**Fallback**: If `/spec-review` is not available (skill invocation fails or the plugin is not installed), inform the user that the spec review could not be run automatically. Present the spec as-is and suggest the user install the `spec-review` plugin or manually review the spec for the concerns listed in Step 5b. Then proceed to Step 6 with the current spec.

### 5b. Process review feedback

After the review completes, analyze each finding and decide how to handle it:

#### Agreement — incorporate the feedback

For findings you agree with:
- Update the spec to address the issue
- Make the change directly — rewrite the section, add the missing detail, resolve the ambiguity
- No annotation needed; the spec simply improves

#### Disagreement — add consideration notes

For findings you disagree with or believe are not applicable:
- Do NOT silently ignore them
- Add a **Consideration Note** inline in the relevant spec section:

```markdown
> **Consideration Note** ([finding-label/priority]): [1-2 sentence summary of the reviewer's concern and why it was not adopted. Reference specific context or constraints that make this finding not applicable.]
```

Consideration notes serve as a paper trail — they show the concern was seen and evaluated, not overlooked. Future readers can revisit these decisions.

#### Handling by priority

- **Critical findings**: These deserve serious attention. If you disagree with a critical finding, explain your reasoning thoroughly in the consideration note. Consider discussing with the user before dismissing.
- **High findings**: Should generally be addressed. Disagreements are fine but should be well-reasoned.
- **Medium/Low findings**: Use judgment. Many of these are valuable improvements; some may be over-engineering for the scope.
- **Questions from reviewers**: Answer them in the spec by adding the missing information.

---

## Step 6: Deliver the Final Spec

### 6a. Write the hardened spec

Update the spec file at `docs/specs/<filename>.md` with all changes from the review process (if applicable). Change the status from Draft to **Ready**:

```markdown
**Status**: Ready
```

### 6b. Present the final output

Present the final spec to the user with a summary of what changed:

**For complex specs (went through review):**
```
## Spec Complete: docs/specs/<filename>.md

**Issue**: #<N>
**Complexity**: Complex
**Review verdict**: [APPROVED / REVISIONS NEEDED]

### Changes from review
- [List of findings that were incorporated]
- [List of findings noted as considerations with brief reasoning]

The hardened spec is ready at `docs/specs/<filename>.md`.
```

**For trivial specs (skipped review):**
```
## Spec Complete: docs/specs/<filename>.md

**Issue**: #<N>
**Complexity**: Trivial (spec review skipped)

The spec is ready at `docs/specs/<filename>.md`.
```
