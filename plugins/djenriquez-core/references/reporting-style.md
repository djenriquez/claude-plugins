# Reporting Style

Thin, always-relevant tone for text that reports finished work to someone who
did not watch it happen: PR descriptions, digests, thread replies, turn
summaries, and other user-facing results.

This is **not** a full Simplified Technical English manual. Heavy sentence
craft for runbooks and reference pages lives in `djenriquez-core:technical-writing`
and loads only when authoring those documents. AI-slop cleanup lives in
`djenriquez-core:humanizer`.

## When this applies

| Artifact | Load reporting? | Also load |
|----------|-----------------|-----------|
| PR body / title (`pr-publish`) | yes | humanizer `pr-body` |
| PR digest | yes | humanizer `digest` |
| PR thread reply | yes | humanizer `pr-reply` |
| Spec narrative | yes (register) | humanizer `spec-narrative` |
| Review inline comments | light (meaning + evidence) | humanizer `review-comment` (teammate voice wins on contractions) |
| Runbook / README / API reference / long how-to | yes | technical-writing + humanizer as needed |
| Narrative essay / person-sounding prose | no | humanizer `general` only |

## Meaning first

Get the meaning right, then make the language plain. Plainer wording is only
worth having when it still says the same thing.

- Preserve identifiers, commands, paths, error text, units, and quoted strings
  exactly.
- Preserve the sequence of operations you actually performed or that the change
  implements.
- Preserve normative force: a requirement stays a requirement; a suggestion
  stays a suggestion. Do not promote "should" to "must" or the reverse while
  cleaning prose.
- Use one name for one component, service, state, or result. Repeat the name;
  a synonym reads as a second thing.
- Name a gap instead of filling it with a plausible guess.

## Lead with the outcome

The first sentence says what happened, what changed, or what you found.
Explain the result from scratch in complete sentences. Do not continue
internal notes or agent shorthand.

Expand compressed notation into plain clauses:

- Avoid: `Fixed: timeout → retry path → green.`
- Prefer: `The request timeout is fixed. The client retries once after a transient gateway error, and the integration test passes.`

## Brevity means fewer ideas

Be brief by carrying fewer ideas, not by compressing the ones you keep into
fragments. A short message of whole sentences beats a shorter one of arrows
and labels.

Include a detail only when it changes what the reader understands or does
next. Leave the rest out.

Do **not** enforce word-count caps mid-generation. Counting words while
writing clips meaning to satisfy a number. Prefer one topic per sentence and
cut surplus ideas instead.

## Evidence

Claim that a test passed, a build succeeded, or a bug is fixed only when tool
output or the repository showed it. Otherwise say you expect it, or that it is
unverified. When work is unfinished, say what remains and why.

## Register

For reported work and technical documents, prefer full contractions in formal
docs when clarity helps (`do not`, `cannot`) — but **review comments and short
PR replies may use natural teammate contractions**. Narrative prose meant to
sound like a person talking is a different job: humanizer owns that voice and
must not force blog personality onto PR bodies or digests.

## Final skim (three checks, not a ritual checklist)

Before shipping reported text:

1. Does the first sentence give the outcome?
2. Would a reader who only has this text (not your session) understand it?
3. Did you invent verification, soften a requirement, or rename the same thing twice?
