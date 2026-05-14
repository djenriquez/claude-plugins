# MCP External Model Debate Protocol

Stress-test review output with external models before delivering. Skip entirely if no debate-capable external-model MCPs are available; the invoking skill should continue with its normal self-critique or final checks.

## Discovery

Treat a provider as available only when the current tool list exposes an exact, callable, debate-capable tool. A debate-capable tool must accept an arbitrary review prompt and return external-model feedback. If it supports model selection, it must also accept the pinned `model` parameter in this protocol.

Do not use provider-name matches alone as availability. In some harnesses, `ToolSearch` searches only deferred tools and cannot discover already-loaded namespaces such as `mcp__claude_code__`. Also, an operational MCP namespace is not automatically a debate provider: for example, `mcp__claude_code__` tools such as `Read`, `Bash`, or `Agent` do not count unless that namespace exposes a direct external-model prompt endpoint.

Check for already-loaded callable tools first:

- Claude is available only if a visible tool exposes a direct external-model prompt endpoint that accepts the debate prompt and returns model feedback. Operational `mcp__claude_code__` tools such as `Read`, `Bash`, or `Agent` do not count.
- Codex is available only if both `mcp__codex__codex` and `mcp__codex__codex-reply` are visible.
- Gemini is available only if `mcp__gemini-cli__ask-gemini` is visible.

Use `ToolSearch` only as a fallback for deferred tools:

```
ToolSearch(query: "claude", max_results: 3)
ToolSearch(query: "codex", max_results: 3)
ToolSearch(query: "gemini", max_results: 3)
```

After each `ToolSearch` result, verify the returned schema exposes a direct external-model prompt tool and the required arguments before using it. For Codex and Gemini, prefer the exact callable tools listed above. For Claude, record the exact callable tool name, prompt argument, optional model argument, and model name exposed by the verified schema.

Record only verified debate-capable MCPs as available. If the invoking skill is running in Codex and verified Claude debate tooling is available, prefer Claude as the first cross-model debate provider. If no listed provider is available and no equivalent external-model prompt tool is available, skip the debate phase.

## Execution

Run debates sequentially — the second debate benefits from the first's findings.

Construct a debate prompt containing:
1. The content being reviewed (spec text, PR diff, etc.)
2. The review output being challenged (synthesized findings, verdict, changelog)
3. Adversarial challenge questions (provided by the invoking skill — at least 5)

## Execution Failure Handling

Discovery only proves that a provider exposes a callable debate tool. Keep these execution-time outcomes distinct:

- **Unavailable at preflight**: no verified debate-capable MCP tool was found. The invoking skill should skip the debate phase before building a debate prompt.
- **Rejected at execution**: the provider was available, but the harness/user declined the tool call. Treat the exact harness message `The user doesn't want to proceed with this tool use` as a terminal rejection for that provider and this run.
- **Execution failed**: the provider call was accepted but timed out, returned a transport/tool error, or produced null/empty output.

Use a bounded attempt policy unless the invoking skill explicitly overrides it:

- Before making provider calls, give the user one checkpoint for the entire debate phase: announce the enrolled providers and ask whether to run or skip the phase. If the user declines, skip the whole debate phase and continue the invoking workflow.
- Make at most one MCP debate attempt per enrolled provider.
- Use a 5 minute timeout per provider attempt.
- On rejection, timeout, transport error, tool error, stream disconnect, or null/empty output, mark only that provider failed or rejected and continue with any remaining enrolled providers.
- If all enrolled providers fail or are rejected, record the debate as `skipped — execution declined or unreachable` and continue the invoking workflow.
- Do not retry a rejected provider with a different model, smaller payload, or alternate prompt. A harness permission decline is a user decision, not a recoverable model error.

### Provider Model Pinning (required)

Always pass the `model` parameter explicitly on every MCP call below when the provider supports it. Without an explicit model, these servers fall back to whatever default is configured in the user's environment, which is frequently an older generation — debate quality degrades noticeably when that happens. Update the values here when new flagship models ship so every skill picks up the change in one place.

Current pinned models:

- **Claude**: use the model exposed by the discovered Claude MCP tool; when the tool supports a `model` parameter, pass that model explicitly rather than relying on an implicit default
- **Codex**: `gpt-5.5`
- **Gemini**: `gemini-3.1-pro`

If a pinned model is rejected by the MCP server (not configured, not yet available, access error), treat that provider as failed under the execution failure policy and surface the failure in the invoking skill's final output so the user knows to update this protocol or their MCP config. Do **not** silently omit the `model` parameter to work around the error — that is the exact failure mode this section exists to prevent.

### Provider Example: Claude (if available)

Use the verified Claude MCP prompt tool recorded during discovery. Tool names vary by MCP server, so use the recorded schema instead of guessing a hard-coded function name. Do not use operational `mcp__claude_code__` tools unless that namespace also exposes a direct external-model prompt endpoint. When the tool supports a `model` parameter, pass the discovered Claude model explicitly. Ask the same adversarial challenge questions as the other providers. Make one call for this provider; do not start follow-up rounds unless the invoking skill explicitly opts out of the bounded attempt policy.

### Provider Example: Codex (if available)

1. Start with `mcp__codex__codex(model: "gpt-5.5", prompt: <debate prompt>)`.
2. Use `mcp__codex__codex-reply` only when the invoking skill explicitly opts out of the bounded attempt policy. The session is bound to the model set on the opening call; replies do not need the parameter re-passed.
3. Under the bounded attempt policy, the opening `mcp__codex__codex` call is the provider's only attempt.

### Provider Example: Gemini (if available)

1. Call `mcp__gemini-cli__ask-gemini(model: "gemini-3.1-pro", prompt: <debate prompt>)`.
2. Make one call for this provider; do not start follow-up rounds unless the invoking skill explicitly opts out of the bounded attempt policy. If a follow-up is explicitly allowed, pass the `model` parameter on every follow-up as well because Gemini calls are stateless.
