---
name: audit-state-machines
description: "Finds the implicit state machines in a codebase or subsystem and gives each one a disposition: make it explicit, contain it with a cheap guard, accept it on the record with a revisit trigger, or delete it with the code that holds it. Read-only audit; not a code review, and it changes no code."
argument-hint: "[path, package, or subsystem, or omit for the whole repo]"
disable-model-invocation: false
allowed-tools:
  - Bash(git:*)
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
`references/harness-adapters.md` only when spawning across harnesses. Load
`references/reporting-style.md` while presenting.

## Invariants

- Read-only: no edits, commits, pushes, or review posts. This audit does not
  block merge and does not turn its ACT entries into work by itself; they
  become specs or issues when the user takes them up.
- Every machine reported gets exactly one disposition, reached from the
  scoring axes in the reference — not from how alarming the encoding looks.
- `ACCEPT` requires a revisit trigger a later diff can be checked against.
  An acceptance without one does not ship in the report.
- `ACT` entries are spec-ready: inferred states and transitions, writer
  sites, one concrete harm scenario, the owning seam, and a verification
  note. Keep this list short; if it is long, the scoring was not done.
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
- no argument: the whole repo, split by top-level package or module

Collect the existing explicit machines first (state-machine frameworks,
typed enums with exhaustive consumers, transition tables). They set the
local bar, and their implicit twins — a framework state shadowed by flags
that duplicate it — are a common finding.

## Fan Out

For a target spanning more than one package, spawn read-only explorers in
parallel, one per package or subsystem slice. Give each explorer:

- its slice and the repo path
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
on the axes, then assign the disposition:

- `ACT` — a hard trigger is present and a concrete harm scenario can be
  stated. If the harm cannot be stated, it is not ACT.
- `CONTAIN` — no ACT case, but a named cheap guard is missing.
- `ACCEPT` — the acceptable criteria hold; record the reason and the
  revisit trigger.
- `DELETE` — the code is frozen, deprecated, or scheduled for removal;
  record which removal takes the machine with it.

Rank ACT entries by blast radius, then by how many readers depend on the
encoding. Rank CONTAIN entries by guard cost, cheapest first.

## Present

Present in this order:

1. **Coverage** — target, slices searched, exclusions, explicit machines
   found, total candidates that met the bar.
2. **Counts** — how many entries per disposition.
3. **ACT** — full entries, ranked. Each one is the input to a `/write-spec`
   run if the user picks it up.
4. **CONTAIN** — one line per entry: the machine, where it lives, the exact
   guard proposed.
5. **ACCEPT** — one line per entry: the machine, why it is acceptable, its
   revisit trigger.
6. **DELETE** — one line per entry: the machine and the removal that takes
   it.

If the user asks for the audit as a file, write the same content to the
path they name; a saved audit is what later `/code-review` runs check
ACCEPT triggers against. Do not write a file they did not ask for.

Stay in Q&A on the report (read more code if asked). Do not start fixing
ACT entries from this skill; offer `/write-spec` on the top entry as the
follow-up when the user wants to act.
