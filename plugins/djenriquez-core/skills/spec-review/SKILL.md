---
name: spec-review
description: "Orchestrates a three-phase parallel spec review using an agent team. Phase 1: dynamically selected specialists each review the spec and self-critique findings. Phase 2: lead-mediated cross-review where specialists challenge each other's findings. Phase 3: deduplicated synthesis with priority-based output and binary approval verdict."
argument-hint: "[file path, #N (GitHub issue/PR), URL, 'staged', or omit for conversation context]"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Glob
  - Grep
  - Task
  - TeamCreate
  - TeamDelete
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
  - SendMessage
  - WebSearch
  - WebFetch
  - ToolSearch
mcpServers:
  - codex
  - gemini-cli
---

# Spec Review Agent Team

**YOU MUST SPAWN AN AGENT TEAM.** Do NOT review the spec yourself. You are the team lead — your job is orchestration, not review.

Your workflow:
1. Gather the spec
2. Classify risk lane and select relevant specialists
3. Create a team and spawn specialists
4. **Phase 1**: Collect specialist findings (each agent reviews + self-critique)
5. **Phase 2**: Mediate cross-agent challenges (L1/L2 only)
6. **Phase 3**: Synthesize into final review
7. Clean up

The target of the review is: $ARGUMENTS

If $ARGUMENTS is empty, ask the user what to review.

## Step 1: Gather the Spec

Obtain the spec content before spawning agents.

### Input Detection

- **`#N`** (GitHub number): GitHub uses a single number space — `#N` is either an issue or a PR. Run `gh issue view <N> 2>/dev/null || gh pr view <N>` to resolve which. Then:
  - **If issue**: The issue body is the primary spec. Pull comments via `gh api repos/{owner}/{repo}/issues/<N>/comments` for discussion context, clarifications, and decisions made in-thread. Check for linked PRs — if one exists, also pull its diff as implementation context.
  - **If PR**: Check if the PR description is the spec, or if the diff contains spec files (`.md`, `.txt`, design docs). Read both. Check for a linked issue — if one exists, pull it as additional spec context.
- **File path**: Read the file directly. Supports markdown, txt, or any text format.
- **URL**: Use `WebFetch` to retrieve the content. Works with Google Docs, Notion, Confluence, and other web-accessible docs.
- **"staged"**: `git diff --cached --name-only` to find staged files, then read spec-like files (`.md`, `.txt`, etc.).
- **No argument**: The spec should be in the conversation context. If not, ask the user.

Multiple arguments can be combined (e.g., `#42 path/to/spec.md`). When combining, the file or issue body is the primary spec; other sources provide supporting context.

### Gathering Context

Also gather:
- Related existing specs or design docs in the repo (use Glob/Grep to find them)
- The codebase area this spec targets (understand the current architecture)
- Linked issues or PRs referenced in the spec (follow `#N` references via `gh issue view` or `gh pr view`)

## Step 2: Assess, Classify, and Select Agents

### Spec Size

Note the spec length (sections, paragraphs, word count). Larger specs warrant more reviewers.

### Risk Lane

| Lane | Criteria | Self-Critique? | Cross-Review? |
|------|----------|----------------|---------------|
| **L0 — Minor** | Typo fixes, small clarifications, addenda to existing specs | No | No |
| **L1 — Significant** | New features, API additions, workflow changes, 3+ sections | Yes | Yes |
| **L2 — Strategic** | Architecture changes, new services, public API, security-sensitive, data model changes | Yes | Yes |

### Dynamic Agent Selection

Analyze the spec and select which specialists are relevant. Not every spec needs all 8 agents. Err toward including rather than excluding for L1/L2.

| # | Agent | Spawn guidance |
|---|-------|----------------|
| 1 | clarity-reviewer | Always. The "two engineers" test — would two engineers build the same thing from this spec? |
| 2 | completeness-reviewer | Always. Missing edge cases, error behavior, NFRs, state transitions. |
| 3 | product-reviewer | L1/L2 always. Goal alignment, user value, success criteria. Answers "are we building the right thing?" |
| 4 | feasibility-reviewer | New services, architecture changes, significant new features. Hidden complexity, alternative approaches. |
| 5 | api-reviewer | Spec defines or modifies an API. Backward compat, protobuf conventions, naming, idempotency. |
| 6 | operations-reviewer | Production-impacting changes. Failure modes, observability, rollback, SLO impact. |
| 7 | scope-reviewer | L1/L2 only. Multi-team, multi-phase, or large specs. Incremental delivery, dependency risks. |
| 8 | complexity-reviewer | L1/L2. Specs introducing new abstractions, multi-layer designs, configurable systems, or framework-like patterns. Catches premature abstraction, over-engineering, and accidental complexity. |

For **L0**: spawn only agents 1 and 2.

State which agents you're spawning and why before proceeding.

## Step 3: Create Team and Spawn Agents

### 3a. Load the shared review protocol

Before spawning agents, read the shared review protocol that governs all specialists:

```
Glob(pattern: "**/protocols/review-protocol.md", path: "~/.claude/plugins")
```

Read the file found. This protocol text will be included in every agent's task prompt.

### 3b. Create the team

```
TeamCreate(team_name: "spec-review-<short-identifier>")
```

### 3c. Create tasks for each selected agent

For each selected agent, call `TaskCreate` with subject, description, and activeForm.

### 3d. Spawn all agents in a SINGLE message

Each specialist has a custom agent definition (in `agents/`) with its specialist instructions and persistent memory. The shared review protocol (taxonomy, qualification, self-critique, cross-review, output format) is injected via the task prompt.

Spawn using `subagent_type` matching the agent name:

```
Task(
  subagent_type: "clarity-reviewer",
  name: "clarity-reviewer",
  team_name: "spec-review-<identifier>",
  run_in_background: true,
  prompt: "REVIEW PROTOCOL:\n<contents of review-protocol.md>\n\nRISK LANE: L1\n\nSELF-CRITIQUE REQUIREMENT:\nThis is an L1/L2 review. After your specialist review, stress-test your findings through self-critique before sending them. Follow the Self-Critique protocol and prune or downgrade findings that don't survive scrutiny.\n(For L0 reviews, replace the above with: SELF-CRITIQUE: Not required for L0. Send findings directly.)\n\nSPEC CONTEXT:\n<Title, purpose, and any relevant background about what this spec covers>\n\nRELATED CODEBASE CONTEXT:\n<Brief description of the existing system this spec targets, if applicable>\n\nSPEC CONTENT:\n<the full spec text>\n\nYour task has been created as Task #N. Update it to in_progress when you start, and mark it completed when done sending findings."
)
```

Repeat for every selected agent — all `Task` calls in ONE message.

After spawning, use `TaskUpdate` to set `owner` on each task to the corresponding agent name.

**CRITICAL**: Each agent's prompt MUST contain the full review protocol AND the full spec text. Agents cannot see either unless you include them in their prompt.

## Step 4: Phase 1 — Collect Specialist Findings

Agents work in parallel:
1. Each agent conducts its specialist review of the spec
2. Each agent self-critiques findings to harden them (L1/L2 only)
3. Each agent sends hardened findings to you via `SendMessage`
4. Each agent then goes idle, waiting for Phase 2

Wait for **all** agents to report. Messages are delivered automatically — you do not need to poll.

**Error recovery**: If an agent fails or crashes, re-spawn it with the same prompt and reassign its task.

## Step 5: Phase 2 — Lead-Mediated Cross-Review (L1/L2 only)

**Skip for L0.**

**Short-circuit rule**: If ALL Phase 1 findings are `suggestion`, `nitpick`, `thought`, or informational (zero `blocker`, `risk`, or `question` findings across all agents), skip cross-review. State in the synthesis: "Phase 2 skipped: no blocker/risk/question findings to challenge."

After collecting all Phase 1 findings:

1. **Identify cross-review targets** using your judgment AND the routing table:

   | Finding Source | Route To |
   |----------------|----------|
   | clarity-reviewer | completeness-reviewer |
   | completeness-reviewer | product-reviewer |
   | product-reviewer | scope-reviewer |
   | feasibility-reviewer | complexity-reviewer |
   | api-reviewer | operations-reviewer |
   | operations-reviewer | feasibility-reviewer |
   | scope-reviewer | product-reviewer |
   | complexity-reviewer | feasibility-reviewer |

   Prioritize routing:
   - **Contradictions**: two agents disagree
   - **Domain overlap**: a finding where another specialist has relevant expertise
   - **High-severity findings** (blockers and P0/P1 risks) that deserve a second opinion

2. **Route challenges** via `SendMessage` to the best-positioned agent. Include the original finding, its source agent, and what you want challenged.

3. **Collect responses**: the challenged agent evaluates and responds. Max 1 challenge round per finding.

4. **Arbitrate**: if agents cannot align, you decide. You are the final arbiter.

5. **Tag findings**: Confirmed / Modified / Withdrawn / Disputed

## Step 6: Phase 3 — Synthesize the Final Review

Use the comment taxonomy, priority levels, and framing rules from the review protocol (loaded in Step 3a) when classifying and writing findings in the synthesis.

### Deduplication

Consolidate findings flagged by multiple agents into the single most impactful framing. Note which agents agreed. When deduplicating, use the highest priority (lowest P-number) assigned by any agent.

### Calibrate to Risk Lane (internal — not surfaced in output)

- L0: SHORT review. Few key points only.
- L1: Thorough but proportional.
- L2: Comprehensive.

### Priority Mapping (internal classification → output tier)

| Output Tier | Maps From |
|---|---|
| Critical | Any `blocker` finding (regardless of P-level) |
| High | P0/P1 non-blocker findings |
| Medium | P2 findings |
| Low | P3 findings, nitpicks, thoughts |

Empty tiers are omitted. Questions get folded into the appropriate tier based on their priority.

### Output Structure

```
## Summary
- **Spec**: [Title or filename]
- **Risk Lane**: L0/L1/L2
- **Reviewers**: [List of specialists who reviewed]
- **One-line assessment**: [Overall take]

## Critical
[Items that must be resolved before implementation]

**Section — Title**
Blurb describing the gap, ambiguity, or issue. Include concrete harm scenario and suggested fix or rewrite.
- **Specialist**: [clarity/completeness/etc.] — [must fix / can defer] — [1-sentence rationale]
- **Cross-review**: [Confirmed / Modified / Disputed] — [1-sentence note] (L1/L2 only)

## High Priority
[Items that should be addressed before implementation starts]
(same per-item format)

## Medium Priority
(same per-item format)

## Low Priority
(same per-item format)

## Verdict: APPROVED / REVISIONS NEEDED
[1-2 sentence rationale. If REVISIONS NEEDED, list the Critical items that must be resolved.]
```

### Verdict (REQUIRED — must be the LAST section)

Binary. No "approved with suggestions" — either the spec is ready for implementation or it isn't.

**No Critical items — APPROVED:**

```
## Verdict: APPROVED
This spec is ready for implementation. [1-2 sentence rationale.]
```

**Critical items exist — REVISIONS NEEDED:**

```
## Verdict: REVISIONS NEEDED
This spec has [N] critical item(s) that must be resolved before implementation:
1. **[Title]** — [Section] — [What must change and why]
...
Once these are addressed, the spec should be ready for implementation.
```

### Final Anti-Pattern Checks

Before delivering, verify you are NOT:
- Producing a wall of text (concision = respect)
- Demanding perfection (approve if the spec is clear enough to build from)
- Including unresolved conflicting feedback
- Framing opinions as mandates
- Bikeshedding on wording when meaning is clear

## Step 7: MCP Cross-Model Debate (conditional)

After synthesizing the agent team's review, stress-test the findings with external models before delivering.

**Skip this step if no MCPs are available.**

### 7a. Discover and execute debates

Read `protocols/mcp-debate.md` (find via `Glob(pattern: "**/protocols/mcp-debate.md", path: "~/.claude/plugins")`). Follow the discovery and execution instructions.

### 7b. Debate prompt

Construct the debate prompt with:

> You are reviewing a spec review produced by a team of specialist reviewers. Your job is adversarial: find what they got wrong, what they missed, and where severity is miscalibrated.
>
> ## Original Spec
> <full spec text>
>
> ## Synthesized Review
> <full Phase 3 output — all findings, priorities, and verdict>
>
> ## Challenge Questions
> 1. Which findings are false positives — flagging something that isn't actually a problem?
> 2. What did the reviewers collectively miss? What gaps, risks, or ambiguities did no agent catch?
> 3. Which findings have miscalibrated severity — blockers that should be suggestions, or suggestions that should be blockers?
> 4. Does the verdict (APPROVED / REVISIONS NEEDED) follow from the findings, or is it too lenient/strict?
> 5. Are any findings redundant despite deduplication — same concern wearing different hats?

### 7c. Incorporate debate findings

Evaluate each MCP point against the same finding qualification bar:

- **False positive challenges**: Withdraw if convincing. Tag: `[withdrawn after <Codex|Gemini> challenge]`.
- **New findings**: Add if they pass the qualification bar. Tag: `[surfaced by <Codex|Gemini>]`.
- **Severity adjustments**: Adjust if compelling. Tag: `[severity adjusted per <Codex|Gemini>]`.
- **Redundancy**: Merge if an MCP identifies same-concern duplicates.

Re-check the verdict if Critical findings were added or withdrawn.

Add a "Cross-Model Debate" section to the output:

```
### Cross-Model Debate
- **Models consulted**: [Codex, Gemini, or both]
- **Findings modified**: [count] ([list: withdrawn, added, severity-adjusted])
- **Verdict impact**: [unchanged / changed from X to Y]
```

## Step 8: Clean Up

After delivering the review, shut down all agents and delete the team. Agents persist learnings via their local memory directories — they do not need to stay alive for context retention.

## Calibration Principles

1. **The spec is not the implementation.** Don't demand implementation-level detail in a design document. The spec should constrain, not dictate.
2. **The author is competent.** Assume good intent and context you may lack. Ask before assuming wrong.
3. **Proportional rigor.** A 2-page addendum doesn't need the same scrutiny as a new service design.
4. **Every comment has a cost.** 3 high-signal findings > 30 mixed-signal findings.
5. **Be explicit about severity.** The taxonomy distinguishes "this will cause data loss" from "this could be worded better."
6. **Speed matters.** A timely review > a perfect review delivered after implementation started.
7. **Shared understanding is the product.** Success = the implementing team knows exactly what to build.
