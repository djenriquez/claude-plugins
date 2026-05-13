# MCP External Model Debate Protocol

Stress-test review output with external models before delivering. Skip entirely if no external-model MCPs are available; the invoking skill should continue with its normal self-critique or final checks.

## Discovery

Use `ToolSearch` to probe for available debate partners. Start with the concrete providers this protocol currently knows how to call:

```
ToolSearch(query: "claude", max_results: 3)
ToolSearch(query: "codex", max_results: 3)
ToolSearch(query: "gemini", max_results: 3)
```

Record which MCPs returned results, using the provider/model names they expose. If the invoking skill is running in Codex and Claude is available, prefer Claude as the first cross-model debate provider. If no listed provider is available and no equivalent external-model MCP is available, skip the debate phase.

## Execution

Run debates sequentially — the second debate benefits from the first's findings.

Construct a debate prompt containing:
1. The content being reviewed (spec text, PR diff, etc.)
2. The review output being challenged (synthesized findings, verdict, changelog)
3. Adversarial challenge questions (provided by the invoking skill — at least 5)

### Provider Model Pinning (required)

Always pass the `model` parameter explicitly on every MCP call below when the provider supports it. Without an explicit model, these servers fall back to whatever default is configured in the user's environment, which is frequently an older generation — debate quality degrades noticeably when that happens. Update the values here when new flagship models ship so every skill picks up the change in one place.

Current pinned models:

- **Claude**: use the model exposed by the discovered Claude MCP tool; when the tool supports a `model` parameter, pass that model explicitly rather than relying on an implicit default
- **Codex**: `gpt-5.5`
- **Gemini**: `gemini-3.1-pro`

If a pinned model is rejected by the MCP server (not configured, not yet available, access error), stop and surface the error in the invoking skill's final output so the user knows to update this protocol or their MCP config. Do **not** silently omit the `model` parameter to work around the error — that is the exact failure mode this section exists to prevent.

### Provider Example: Claude (if available)

Use the Claude MCP tool returned by `ToolSearch(query: "claude", max_results: 3)`. Tool names vary by MCP server, so use the discovered tool schema instead of guessing a hard-coded function name. When the tool supports a `model` parameter, pass the discovered Claude model explicitly. Ask the same adversarial challenge questions as the other providers. Continue follow-up rounds until convergence or 5 rounds maximum.

### Provider Example: Codex (if available)

1. Start with `mcp__codex__codex(model: "gpt-5.5", prompt: <debate prompt>)`.
2. Continue via `mcp__codex__codex-reply` until convergence or **5 rounds maximum**. The session is bound to the model set on the opening call; replies do not need the parameter re-passed.
3. **Convergence check** after each reply — continue if ANY is "yes"; stop only when ALL are "no":
   - Did this turn surface a new finding or angle?
   - Did either position change?
   - Are there unexplored areas relevant to the content?

### Provider Example: Gemini (if available)

1. Call `mcp__gemini-cli__ask-gemini(model: "gemini-3.1-pro", prompt: <debate prompt>)`.
2. If the response raises substantial points needing follow-up, call again with targeted questions — pass the `model` parameter on every follow-up as well; Gemini calls are stateless.
3. One round is sufficient if the response comprehensively covers all challenge questions.
