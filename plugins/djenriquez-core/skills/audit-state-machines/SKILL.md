---
name: audit-state-machines
description: "Finds the implicit state machines in a codebase, subsystem, or pull request and gives each one a disposition: make it explicit, contain it with a cheap guard, accept it with a revisit trigger, or remove the code or state that holds it. Read-only, session-only audit; not a code review, and it changes no code and writes no files."
argument-hint: "[path, package, subsystem, or PR, or omit for the whole repo]"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
  - Bash(gh:*)
  - Read
  - Glob
  - Grep
  - Agent
  - Task
  - Skill
  - AskUserQuestion
---

# Audit State Machines

Find every lifecycle in the target that is encoded implicitly — in flag
clusters, string values, nil-ness, counters, or scattered mutations — and
decide what each one deserves. The deliverable is the dispositions, not the
list: a census where everything looks equally urgent helps nobody act.

Target: `$ARGUMENTS`. If missing, audit the whole repository at its root.

Load `references/state-machines.md` from the plugin root before starting.
It holds the definition, the encodings to look for, when implicit is
acceptable, the hard triggers, and the four dispositions
(`ACT` / `CONTAIN` / `ACCEPT` / `DELETE`). Load
`references/github-pr-workflow.md` only for a PR target. Load
`references/harness-adapters.md` only when spawning across harnesses. Load
`references/reporting-style.md` while presenting. Required humanizer pass
in `digest` mode before presenting (inline Process by default, the same
way `audit-decisions` applies its `ledger` pass): clean the prose without
changing a disposition, a revisit trigger, or the evidence under an entry.

## Invariants

- Read-only and session-only: no edits, files, commits, pushes, or review
  posts. The report lives in this session for the user to work through. The
  audit does not block merge and does not turn its entries into work by
  itself; they become specs or issues when the user takes them up.
- Every machine reported gets exactly one disposition, reached from the
  scoring axes in the reference — not from how alarming the encoding looks.
- `ACCEPT` requires a revisit trigger a later diff can be checked against.
  An acceptance without one does not ship in the report.
- `ACT` does not need a bug. It needs a hard trigger and a simpler explicit
  shape the entry can show. Each `ACT` entry carries enough to act on:
  inferred states and transitions, writer sites, what the explicit version
  removes, a harm scenario when one exists, the owning seam, and a
  verification note.
- Coverage is stated honestly: what was searched, what was excluded
  (generated code, vendored code, tests unless asked), and any area the
  pass could not read. A partial census labeled as complete is a failed run.

## Gather

Resolve the target:

- path or package: audit that subtree, plus the callers and consumers of
  its state wherever they live — a machine's writers and readers rarely
  sit in one directory
- subsystem named in prose: locate it with Glob/Grep and confirm the
  boundary before fanning out
- PR number or URL: the lifecycles the diff adds or changes, plus their
  writers and readers outside it. Inspect local `HEAD` against
  `origin/<baseRefName>` only when already on the PR branch; otherwise ask.
  Do not checkout a dirty tree.
- branch name: the same, from `git diff <base>...<branch>`
- no argument: the whole repo, split by top-level package or module

Collect the existing explicit machines first (state-machine frameworks,
typed enums with exhaustive consumers, transition tables). They set the
local bar, and their implicit twins — a framework state shadowed by flags
that duplicate it — are a common finding.

## Fan Out

For a target spanning more than one package, spawn read-only explorers in
parallel, one per package or subsystem slice. Give each explorer:

- its slice and the repo path, plus the diff range for a PR or branch target
- `references/state-machines.md`
- the instruction to return candidate machines in the reference's terms:
  encoding sites, inferred states, writers, and the transitions or
  combinations it found — evidence, not dispositions

Explorers report; the lead dispositions. Two explorers will describe the
same cross-package machine differently; deduplicate by lifecycle, not by
file. Retry a failed explorer once; if a slice stays uncovered, say so in
the coverage note instead of auditing it from this session.

For a single-package target, one pass from this session is fine.

## Evaluate

For each candidate, check the qualification bar in the reference, score it
on the axes, then assign the first disposition that fits, in this order:

- `DELETE` — the machine lives in dead, frozen, or deprecated code, or in
  state that duplicates another source of truth; name what to remove, or
  the tracked removal that covers it.
- `ACT` — a hard trigger is present and the explicit version is simpler:
  the entry names what it removes (flags, representable combinations,
  writer sites, conditionals). Cleaner, easier-to-follow code is enough; a
  harm scenario strengthens the entry but is not required. If the explicit
  version only adds a type on top, or one local guard would do, it is not
  ACT.
- `ACCEPT` — the acceptable criteria hold; record the reason and the
  revisit trigger.
- `CONTAIN` — none of the above, but a named cheap, local guard is missing.

Rank ACT entries with a harm scenario first, then by blast radius, then by
how many readers depend on the encoding. Rank CONTAIN entries by guard cost,
cheapest first.

## Present

Present in this order:

1. **Coverage** — target, slices searched, exclusions, explicit machines
   found, total candidates that met the bar.
2. **Counts** — how many entries per disposition.
3. **ACT** — full entries, ranked.
4. **CONTAIN** — one line per entry: the machine, where it lives, the exact
   guard proposed.
5. **ACCEPT** — one line per entry: the machine, where it lives, why it is
   acceptable, its revisit trigger.
6. **DELETE** — one line per entry: the machine, where it lives, what to
   remove and what remaining readers use instead, or the tracked removal
   that covers it.

This skill does not post. The reference's "Where an audit lives" section
names the review path for state findings on a PR.

Stay in Q&A on the report (read more code if asked). Do not start fixing
entries on this skill's own initiative. What an entry becomes is the user's
call: a direct fix, a review comment, an issue, or a `/write-spec` run when
the reshape is large enough to need a design.
