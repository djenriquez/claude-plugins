# PR Description Style

The body explains a PR to a reviewer who has the diff open and nothing else. It
is layered: a one-paragraph intent, then grouped detail, then a behavior/risk
summary, then how it was verified. Keep it factual and neutral — explain what
the change does, not how good it is.

## Frame every statement against the base branch, not the journey

The body describes the merged **end state relative to the base branch** — what a
reviewer gets when this merges. The reference frame is `git diff <base>...HEAD`,
never the branch's commit history. Write as if the diff is the first and only
version of this code; the reviewer reads the body with **no knowledge of how the
branch evolved**, so every claim must be verifiable from that diff alone.

Do **not** describe the development path. Avoid the following unless the
contrasted "before" state actually exists **on the base branch**: "now", "no
longer", "previously", "used to", "rather than / instead of \<approach\>", "makes
X \<simpler/conversational/…\>", "reworked", "refactored / switched / migrated
to", "simplified", "renamed from", and any mention of intermediate commits,
reverted approaches, review rounds, rebases, or "this PR initially…".

The **one legitimate before/after**: when the PR changes behavior that already
exists on the base branch — then "previously X → now Y" is correct, because the
"before" is real and visible on the base. Test: *is the "before" state present on
the base branch?* If yes, contrast is fine. If it was only an earlier commit in
this PR, state only the end behavior.

Self-check before finalizing: re-read each sentence as a reviewer who has only
ever seen the base branch and this diff. Rewrite anything that only parses if you
know the branch's history. (A PR that introduces a feature says "Adds X", never
"Makes X \<adjective\>" — the latter implies a prior version the reviewer cannot
see. Quoting a literal string the code emits, e.g. an output label, is not a
journey reference even if it contains a word like "previously".)

## Structure

Use these sections. Omit any that would only restate the title or say "N/A".

### Summary

One short paragraph: what this PR adds or changes, and why it exists, stated as
the end state. Reference a linked issue when one exists ("Closes #N"). Plain
language only — no internal type or function names here. After the full body is
drafted, the required `pr-body` humanizer pass (see `djenriquez-core:humanizer`)
must leave this section skimmable by a busy reviewer.

### What changed

Group by logical concern, not by file. Each group is a coherent unit a reviewer
can understand on its own. Lead each group with one or two sentences, then list
the files it touches with a short note on each. Order most-important first (core
logic before supporting changes such as tests, config, and docs).

### Behavior / Key decisions

When the change has branching behavior, a small table of inputs → outcomes reads
faster than prose. Call out non-obvious choices a reviewer would otherwise have
to reverse-engineer — a guard, a fallback, a deliberately rejected simpler path.
Omit when the change is mechanical.

### Risk surface

What else this touches: affected modules, APIs, or data flows; backward-compat,
schema, or config implications; and what could break. Keep it factual. If the
change is low-risk, say so in a sentence.

### Test plan

The commands or steps that verify the change, as a checklist of what was
actually run. Note coverage gaps factually, not as apology.

## Tone

- Neutral and explanatory: "Adds X", "Supersedes Y when Z" — not "cleanly",
  "simply", or "robust".
- Reference exact file paths (and line numbers when useful) so reviewers can jump
  straight to the code.
- Match the codebase's technical level; do not over-explain domain standards.
- No marketing, no self-congratulation, no restating the title.
- Kill engineering AI-speak: "leverages", "streamlines", "ensures",
  "comprehensive", "seamless", "aligns with best practices". Prefer concrete
  mechanisms and outcomes. See `references/humanizer-patterns.md`.
