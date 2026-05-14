# MCP External Model Debate Protocol

Stress-test review output with external models before delivering. Skip entirely if no debate-capable external-model MCPs are available; the invoking skill should continue with its normal self-critique or final checks.

## Discovery

Treat a provider as available only when the current tool list exposes an exact, callable, debate-capable tool. A debate-capable tool must accept an arbitrary review prompt and return external-model feedback. If it supports model selection, it must also accept the pinned `model` parameter in this protocol.

Do not use provider-name matches alone as availability. In some harnesses, `ToolSearch` searches only deferred tools and cannot discover already-loaded namespaces such as `mcp__claude_code__`. Also, an operational MCP namespace is not automatically a debate provider: for example, `mcp__claude_code__` tools such as `Read`, `Bash`, or `Agent` do not count unless that namespace exposes a direct external-model prompt endpoint.

Check for already-loaded callable tools first:

- Claude is available only if a visible tool exposes a direct external-model prompt endpoint that accepts the debate prompt and returns model feedback. Operational `mcp__claude_code__` tools such as `Read`, `Bash`, or `Agent` do not count.
- Codex is available only if both `mcp__codex__codex` and `mcp__codex__codex-reply` are visible.

Use `ToolSearch` only as a fallback for deferred tools:

```
ToolSearch(query: "claude", max_results: 3)
ToolSearch(query: "codex", max_results: 3)
```

After each `ToolSearch` result, verify the returned schema exposes a direct external-model prompt tool and the required arguments before using it. For Codex, prefer the exact callable tools listed above. For Claude, record the exact callable tool name, prompt argument, optional model argument, and model name exposed by the verified schema.

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

Use a bounded debate policy unless the invoking skill explicitly overrides it:

- Before making provider calls, give the user one checkpoint for the entire debate phase: announce the enrolled providers and ask whether to run or skip the phase. If the user declines, skip the whole debate phase and continue the invoking workflow.
- Make at most one MCP debate session per enrolled provider. Each session may contain up to **10 convergence rounds** — the opening call plus up to 9 follow-up replies — bounded by the convergence check below.
- Use a 5 minute timeout per individual MCP call (opening call or reply), not per session.
- After every call returns, the orchestrator runs the **convergence check** before deciding whether to send another reply. The convergence check is mandatory and is the structural termination signal for this protocol — it cannot be skipped, and stopping based on a model self-declaration is not a substitute. Continue if ANY answer is "yes"; stop the session when ALL are "no" or when the round count reaches 10:
  - Did this round surface a new finding or angle the prior rounds missed?
  - Did the verdict change from the prior round?
  - Are there unexplored areas of the diff (files, behaviors) relevant to the challenge questions?
- On rejection, timeout, transport error, tool error, stream disconnect, or null/empty output during any round, end that provider's session and mark it failed or rejected. Continue with any remaining enrolled providers.
- If all enrolled providers fail or are rejected, record the debate as `skipped — execution declined or unreachable` and continue the invoking workflow.
- Do not retry a rejected provider with a different model, smaller payload, or alternate prompt. A harness permission decline is a user decision, not a recoverable model error.

### Provider Model Pinning (required)

Always pass the `model` parameter explicitly on every MCP call below when the provider supports it. Without an explicit model, these servers fall back to whatever default is configured in the user's environment, which is frequently an older generation — debate quality degrades noticeably when that happens. Update the values here when new flagship models ship so every skill picks up the change in one place.

Current pinned models:

- **Claude**: use the model exposed by the discovered Claude MCP tool; when the tool supports a `model` parameter, pass that model explicitly rather than relying on an implicit default
- **Codex**: `gpt-5.5`

If a pinned model is rejected by the MCP server (not configured, not yet available, access error), treat that provider as failed under the execution failure policy and surface the failure in the invoking skill's final output so the user knows to update this protocol or their MCP config. Do **not** silently omit the `model` parameter to work around the error — that is the exact failure mode this section exists to prevent.

### Provider Example: Claude (if available)

Use the verified Claude MCP prompt tool recorded during discovery. Tool names vary by MCP server, so use the recorded schema instead of guessing a hard-coded function name. Do not use operational `mcp__claude_code__` tools unless that namespace also exposes a direct external-model prompt endpoint. When the tool supports a `model` parameter, pass the discovered Claude model explicitly on every call (Claude debate tools are stateless across calls). Ask the same adversarial challenge questions as the other providers.

1. Open the session with the verified tool, embedded debate prompt, and discovered model.
2. After the response, run the convergence check from the bounded debate policy.
3. If the check says continue and the round count is below 10, send a targeted follow-up via the same tool. Pass `model` again on every follow-up.
4. Stop when the convergence check says stop, when the round count reaches 10, or when any call hits a failure mode from the bounded debate policy.

### Provider Example: Codex (if available)

`mcp__codex__codex` starts a full Codex agent session, not a one-shot completion. The Codex agent can read files, run shell commands, and iterate internally; the MCP call does not return until the session ends. Three failure modes follow from that and have been observed to hang debates indefinitely:

- An approval policy that requires human confirmation will deadlock the session — the calling sub-agent cannot surface approval UI back to the user.
- An unrecognized pinned model can hang silently on some MCP servers (queue or retry without ever returning an error).
- The 5 minute timeout is enforced per individual call by the invoking orchestrator tracking elapsed time. The active harness typically cannot abort a Codex MCP call already in flight, so the orchestrator-driven convergence loop (bounded at 10 rounds), the hardening below, and the per-call timeout are layered defenses against hangs.

Always pass these parameters on every opening Codex debate call:

- `model`: the pinned Codex model (currently `gpt-5.5`)
- `approval-policy: "never"`: prevent Codex from blocking on shell command approval prompts
- `sandbox: "read-only"`: force the session to fail fast if it tries to write
- `base-instructions`: constrain Codex to read-only review behavior and stop it from iterating internally (template below)

1. Open the session:

   ```
   mcp__codex__codex(
     model: "gpt-5.5",
     approval-policy: "never",
     sandbox: "read-only",
     base-instructions: "You are a read-only code reviewer. Inspect only the content embedded in the user prompt and the diff it references. Do not run shell commands beyond what is strictly required to read referenced files, and do not edit, write, or push anything. Return findings as your final response for each turn (Critical/High/Medium/Low with file/line references, plus a verdict). Do not start internal follow-up rounds — return after producing findings and wait for explicit follow-up messages from the orchestrator.",
     prompt: <debate prompt>
   )
   ```

2. After the response, run the convergence check from the bounded debate policy.

3. If the check says continue and the round count is below 10, send a targeted follow-up via:

   ```
   mcp__codex__codex-reply(prompt: <follow-up question>)
   ```

   The session is bound to the model and constraints set on the opening call; replies do not re-pass those parameters.

4. Stop when the convergence check says stop, when the round count reaches 10, or when any call hits a failure mode from the bounded debate policy.

If any individual call exceeds the orchestrator's 5 minute per-call budget with no return, end the session, mark this provider failed for the run, and surface the pinned model name and the hang symptom in the invoking skill's final summary so the user can verify the pinned model is available on their MCP server or update it in the Provider Model Pinning section above.

