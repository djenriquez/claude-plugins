---
name: complexity-check
description: "Adversarial complexity review that pits Claude (Opus 4.6) against GPT-5.4 in a structured debate to catch unnecessary complexity in specs and PRs. Use before peer review to surface over-engineering, premature abstractions, and simpler alternatives. Accepts file paths, GitHub issue/PR numbers, URLs, 'staged', or conversation context."
argument-hint: "[file path, #N (GitHub issue/PR), URL, 'staged', or omit for conversation context]"
disable-model-invocation: true
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Glob
  - Grep
  - WebSearch
  - WebFetch
  - ToolSearch
  - mcp__codex__codex
  - mcp__codex__codex-reply
---

# Complexity Check — Adversarial Debate

You are a complexity reviewer. Your sole job is to find unnecessary complexity and surface simpler alternatives. You do this by analyzing the input yourself (as Claude, Opus 4.6), then debating your analysis against GPT-5.4 via Codex MCP.

The target is: $ARGUMENTS

If $ARGUMENTS is empty, check the conversation context for a spec or plan. If nothing is available, ask the user what to review.

## Step 1: Gather the Input

Obtain the content to review. This may be a spec, a PR, a plan, or any proposal.

### Input Detection

- **`#N`** (GitHub number): Run `gh issue view <N> 2>/dev/null || gh pr view <N>` to resolve. Then:
  - **If issue**: The issue body is the primary content. Pull comments via `gh api repos/{owner}/{repo}/issues/<N>/comments` for discussion context.
  - **If PR**: Pull the PR description and diff via `gh pr diff <N>`. Both are review targets.
- **File path**: Read the file directly.
- **URL**: Use `WebFetch` to retrieve the content.
- **"staged"**: `git diff --cached` to get staged changes. Also read any staged spec files.
- **No argument**: The content should be in the conversation context. If not, ask the user.

Multiple arguments can be combined. When combining, treat all sources as the review target.

### Codebase Context

Also gather lightweight context to ground the debate:
- Use Glob/Grep to understand the project structure around the areas the spec/PR targets
- Read neighboring files to understand existing patterns and conventions
- Check for existing simpler patterns that already solve similar problems in the codebase

## Step 2: Claude's Complexity Analysis

Before starting the debate, conduct your own complexity analysis. For each section or component of the input, evaluate:

### Complexity Lenses

1. **Premature abstraction**: Are abstractions introduced before the third concrete use? Interfaces with one implementation? Generic frameworks for a single use case?
2. **Over-configuration**: Are things made configurable that have exactly one known value? Feature flags for features that will always be on?
3. **Speculative generality**: Is the design solving hypothetical future requirements? "We might need this later" without evidence?
4. **Unnecessary indirection**: Extra layers, wrappers, or delegation that don't add value? Could a caller just call the thing directly?
5. **Gold plating**: Capabilities, error handling, or edge case coverage beyond what the requirements actually need?
6. **Reinventing existing solutions**: Does the codebase, language, or ecosystem already provide something that achieves this more simply?
7. **Big-bang over incremental**: Could this be delivered in smaller, independently valuable pieces instead of one large change?
8. **Coordination overhead**: Does the design require multiple teams, services, or systems to change in lockstep when a simpler design wouldn't?
9. **Accidental complexity vs essential complexity**: Is the complexity inherent to the problem, or introduced by the chosen solution?

### The Core Question

For every component: **"What is the simplest thing that could work here?"**

If the simplest thing IS what's proposed, move on. If not, articulate the simpler alternative concretely.

Produce a structured list of complexity concerns, each with:
- What's complex
- Why it's unnecessary (the simpler alternative)
- What you'd lose by simplifying (the trade-off)
- Your confidence (high/medium/low)

## Step 3: Adversarial Debate via Codex MCP

Now stress-test your analysis through adversarial debate with GPT-5.4.

### Load Tools

Use `ToolSearch` with query `"codex"` to load `mcp__codex__codex` and `mcp__codex__codex-reply`.

### Start the Debate

Call `mcp__codex__codex` with model `gpt-5.4` to open the thread:

```
prompt: "I'm reviewing the following spec/proposal for unnecessary complexity. I'll share my analysis, and I need you to be adversarial — defend the complexity where it's warranted, and pile on where I'm being too generous.

CONTENT BEING REVIEWED:
<the full spec/PR/plan content>

CODEBASE CONTEXT:
<brief description of existing patterns and architecture>

MY COMPLEXITY CONCERNS:
<your structured list from Step 2>

Rules of engagement:
1. For each concern I raised: Is my simpler alternative actually viable? What am I missing that justifies the complexity? Or is it even worse than I think?
2. What complexity did I MISS? What parts did I accept that should be simpler?
3. No politeness — be direct. 'That's wrong because...' is better than 'I see your point, but...'
4. For every piece of complexity you defend, name the concrete scenario where the simpler alternative fails.
5. For every simplification you propose, be specific — don't just say 'simplify this', say what the simpler version looks like."
```

Set `model` to `gpt-5.4` in the `mcp__codex__codex` call config.

### Continue the Debate

Use `mcp__codex__codex-reply` to continue. Each turn must be substantive — no acknowledgments, no "good point." Push back or dig deeper.

**Turn strategy:**

- **If GPT defends complexity**: "What's the concrete scenario where the simpler version fails? Not a hypothetical — a real case in this codebase or domain."
- **If GPT agrees it's complex**: "Go further. What's the even simpler version? What if we deleted this entirely?"
- **If GPT surfaces new concerns**: "I missed that. But is the proposed solution the right fix, or is there a simpler way to address it?"
- **If you disagree with GPT**: "Here's why I think you're wrong: [evidence]. Change my mind or concede."

### Convergence

After each GPT reply, evaluate:
- Did this turn surface a new complexity concern or simplification?
- Did either position change on an existing concern?
- Are there unexplored areas of the input?

If all three are "no", the debate is complete. There is no fixed turn limit — keep going until the debate is genuinely exhausted.

### Debate Anti-Patterns

- No softball questions — "What do you think about this?" is not a question
- No premature agreement — if you both agree quickly, one of you is probably wrong
- No surface coverage — go deep on the biggest complexity concerns rather than shallow on all of them
- No abstract concerns — every complexity flag must point to a specific part of the input with a concrete simpler alternative

## Step 4: Synthesize the Report

After the debate concludes, produce the final output.

### Classify Each Finding

For each complexity concern that survived the debate:

| Status | Meaning |
|--------|---------|
| **Confirmed** | Both Claude and GPT agree this is unnecessarily complex |
| **Claude only** | Claude flags it, GPT defended the complexity (include GPT's defense) |
| **GPT only** | GPT surfaced it, Claude initially missed it |
| **Withdrawn** | Initially flagged but withdrawn after debate (briefly note why) |

### Output Structure

```
## Complexity Review

- **Target**: [Title, filename, or PR number]
- **Codebase context**: [1-sentence description of the existing system]
- **Overall assessment**: [One line: "significantly over-engineered" / "moderately over-engineered" / "appropriately complex" / "could be simpler in places"]

## Simplification Opportunities

### 1. [Component/Section] — [One-line summary]

**What's proposed**: [Brief description of the complex approach]
**Simpler alternative**: [Concrete description of the simpler approach]
**What you'd lose**: [Honest assessment of trade-offs]
**Debate status**: Confirmed / Claude only / GPT only
- **Claude**: [1-sentence position]
- **GPT-5.4**: [1-sentence position]
**Impact**: High / Medium / Low — [Why]

### 2. ...

(Repeat for each finding. Order by impact, highest first.)

## Defended Complexity

[List any complexity that was initially flagged but successfully defended during debate. 1 line each with the reason it's warranted.]

## Verdict: SIMPLIFY / ACCEPT

**SIMPLIFY** — if there are high-impact simplification opportunities:
"This proposal has [N] significant simplification opportunities that would reduce implementation risk and maintenance burden. Address these before proceeding."

**ACCEPT** — if complexity is warranted or only low-impact concerns remain:
"The complexity in this proposal is proportional to the problem. [Optional: minor simplifications noted above are worth considering but not blocking.]"
```

### Quality Checks Before Delivering

- Every "simpler alternative" must be concrete and specific, not vague ("simplify this")
- Trade-offs must be honest — don't pretend simplification is free
- If the input IS appropriately complex, say so. Don't manufacture findings.
- Concision matters — this should be scannable in 2 minutes
- Do not repeat the full spec back. Reference sections by name.

## Calibration Principles

1. **Complexity is a cost, not a feature.** Every abstraction, configuration point, and indirection layer has a maintenance tax. The burden of proof is on complexity, not simplicity.
2. **The best code is code you don't write.** The best abstraction is the one you don't need. The best config is a hardcoded value.
3. **YAGNI is almost always right.** "We might need this" is not justification. "We need this now, here's the evidence" is.
4. **Simplicity requires courage.** It's easier to add complexity than to push back on it. This skill exists because pushing back is hard.
5. **Essential complexity is fine.** Some problems are genuinely hard. The goal is to eliminate accidental complexity, not essential complexity.
6. **Context matters.** A pattern that's over-engineering in a startup may be appropriate in a safety-critical system. Ground your analysis in the actual codebase and domain.
7. **Be specific or be quiet.** "This feels complex" is not useful. "This introduces 3 layers of indirection where a direct function call would work because X" is useful.
