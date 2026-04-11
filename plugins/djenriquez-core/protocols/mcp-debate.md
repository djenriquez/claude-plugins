# MCP Cross-Model Debate Protocol

Stress-test review output with external models before delivering. Skip entirely if no MCPs are available.

## Discovery

Use `ToolSearch` to probe for available debate partners:

```
ToolSearch(query: "codex", max_results: 3)
ToolSearch(query: "gemini", max_results: 3)
```

Record which MCPs returned results. If neither did, skip the debate phase.

## Execution

Run debates sequentially — the second debate benefits from the first's findings.

Construct a debate prompt containing:
1. The content being reviewed (spec text, PR diff, etc.)
2. The review output being challenged (synthesized findings, verdict, changelog)
3. Adversarial challenge questions (provided by the invoking skill — at least 5)

### Codex (if available)

1. Start with `mcp__codex__codex(prompt: <debate prompt>)`
2. Continue via `mcp__codex__codex-reply` until convergence or **5 rounds maximum**.
3. **Convergence check** after each reply — continue if ANY is "yes"; stop only when ALL are "no":
   - Did this turn surface a new finding or angle?
   - Did either position change?
   - Are there unexplored areas relevant to the content?

### Gemini (if available)

1. Call `mcp__gemini-cli__ask-gemini(prompt: <debate prompt>)`
2. If the response raises substantial points needing follow-up, call again with targeted questions.
3. One round is sufficient if the response comprehensively covers all challenge questions.
