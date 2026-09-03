# Humanizer Patterns

Load from the `djenriquez-core:humanizer` skill. Pattern catalog only — process
and modes live in `skills/humanizer/SKILL.md`. Reported-work tone lives in
`references/reporting-style.md`. Procedure craft lives in
`skills/technical-writing/SKILL.md` and loads only when authoring docs a reader
follows.

Forked from abatilo-core humanizer / [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing),
plus engineering-specific tells common in agent-written PRs and reviews.
Refined by abatilo's later split: drop always-on STE word caps and checklists
that make models clip meaning to satisfy a number.

## Core rule

Keep clear text as it is. Prefer concrete subjects and verbs, and claims a
reviewer can verify from the supplied evidence. Word replacement alone will
not fix a comment that repeats itself or hides its point behind abstractions.

**Meaning outranks plainness.** Plainer wording is only worth having when it
still says the same thing. Preserve identifiers, sequence, uncertainty, and
normative force (must / should / may). Do not turn a possible failure into a
confirmed one, or supply missing facts to make vague prose sound specific.

**Brevity means fewer ideas**, not compressed notation. Expand
`Fixed: timeout → retry path → green` into whole sentences; do not enforce
numeric word caps while generating.

---

## Engineering AI-speak (priority for PR/review text)

These show up constantly in agent-written engineering prose. Prefer the rewrite.

| Avoid | Prefer |
|-------|--------|
| leverages / utilizes | uses |
| facilitates | lets / allows / does |
| streamlines | removes a step / cuts X |
| enhances / improves (vague) | name the measurable change |
| robust / seamless / holistic / comprehensive | drop, or name the actual property |
| ensures that | state the mechanism: "rejects …", "retries …" |
| enables X to | "X can" / "X now …" |
| in order to | to |
| it is important to note that | (delete; state the fact) |
| this PR introduces / this change introduces | lead with the subject: "The runner …" |
| carefully / cleanly / simply / just | delete adverbs that sell quality |
| end-to-end (when not literal) | name the path |
| surface area (when vague) | name modules, APIs, or flows |
| aligns with best practices | say which practice, or delete |
| provides the ability to | can |
| serves as a | is |
| acts as a | is / does |
| makes it easier to (journey) | state the end behavior unless base-branch contrast is real |
| correctness gap / lifecycle concern / contract drift | name what fails and when |
| owning seam / trust boundary / source of truth (when vague) | name the function, check, or stored value that matters |
| retry-state lifecycle invariant | when a job is marked complete |

These are cues to inspect meaning, not a banned-word filter. Keep established
terms such as "race condition", "idempotency", or "trust boundary" when they
identify the issue precisely. Do not replace one abstract label with another.

**Parroting:** repeating the title, diff, review request, or previous sentence
without adding information. In a review, include only enough code behavior to
explain the failure. In a reply, answer the point without echoing the request.
Across PR sections, put each detail where it helps most; omit an optional
section that only retells the Summary. A summary can name the main concern
without duplicating the inline comments. Repeating a component's name for
clarity is fine; repeating the claim in new words is not.

**Review ceremony:** "Great catch", "Overall this looks solid", "One small
concern", "Could we perhaps consider", and "This would improve robustness"
often add no information. State the issue or answer directly. Use a question
when the answer could change the finding, not to disguise a required fix as a
suggestion. Keep a real qualifier such as "if this endpoint accepts retries".
Contractions are natural; forced friendliness, slang, and personal anecdotes
are not required.

**Repeated conclusion:** remove endings such as "This is important for
correctness" after explaining the failure. Stop when the reader has the
evidence and any useful next action. Do not add a moral or a second summary.

**Heavy terminology trap:** dumping internal type names, package paths, and
protocol jargon into the first paragraph. Summary/Intent layers need plain
language; symbols belong in Details / What changed / appendix.

**Hard-wrapped prose trap:** mid-paragraph newlines from terminal-width wrapping
in PR bodies (especially Summary). Join into one unbroken line per paragraph;
keep blank lines between paragraphs. Lists and fenced code keep their newlines.

**Before (PR summary):**
> This PR introduces a robust improvement to message handling: the worker previously acked messages before the handler finished, which could drop work if the worker crashed. It now acks only after the handler finishes and nacks on retryable failures, ensuring a more resilient processing lifecycle.

**After:**
> The worker now acks messages after the handler finishes, preventing a crash mid-handler from dropping work that was already acked. It nacks on retryable failures.

Every fact in the rewrite is present in the draft. If all the source says is
"improves reliability", ask the caller for the behavior or evidence; do not
invent the ack/nack explanation.

---

## Content patterns (general AI writing)

### 1. Significance inflation

Watch: stands/serves as, is a testament/reminder, vital/crucial/pivotal role,
underscores/highlights its importance, reflects broader, symbolizing, setting
the stage, key turning point, evolving landscape, indelible mark.

Cut the "why this matters to the universe" sentence. Keep the concrete fact.

### 2. Notability claims

Watch: independent coverage, leading expert, active social media presence,
industry-leading (without evidence).

Replace with a specific source or delete.

### 3. Superficial -ing tails

Watch: highlighting…, ensuring…, reflecting…, contributing to…, fostering…,
showcasing… tacked on after a complete sentence.

Delete the tail or turn it into a second concrete sentence.

### 4. Promotional language

Watch: boasts, vibrant, profound, groundbreaking, renowned, stunning,
nestled, in the heart of, rich (figurative).

Engineering variant: "powerful", "elegant", "clean architecture", "modern".
Stay neutral.

### 5. Vague attributions

Watch: industry reports, observers have noted, experts argue, some critics say
(with no citation).

Name the source or drop the claim.

### 6. Formulaic challenges/outlook

Watch: Despite its… faces several challenges… Despite these challenges…
Future Outlook / The future looks bright.

Replace with one specific risk or omit.

---

## Language patterns

### 7. High-frequency AI vocabulary

Additionally, align with, crucial, delve, emphasizing, enduring, enhance,
fostering, garner, highlight (verb), interplay, intricate, key (adj),
landscape (abstract), pivotal, showcase, tapestry, testament, underscore,
valuable, vibrant.

One occurrence in natural prose can be fine. A cluster is a rewrite signal.

### 8. Copula avoidance

serves as / stands as / marks / represents / boasts / features / offers →
is / has / does.

### 9. Negative parallelisms

"Not only… but…", "It's not just about… it's…", "This isn't X; it's Y".
State the claim directly. Keep a before/after comparison when both states are
supported and the difference helps explain the change.

### 10. Rule of three

Forced triples for a comprehensive feel. Keep only the items that earn space.

### 11. Synonym cycling

Same referent renamed every sentence (the protagonist / main character /
central figure). Pick one name.

### 12. False ranges

"from X to Y" when X and Y are not on a scale. List the actual items.

---

## Style patterns

### 13. Em dash overuse

One em dash per paragraph is fine; stacks of them are a tell. Prefer commas,
parentheses, or a second sentence.

### 14. Bold and emoji decoration

Mechanical **Label:** bullets and emoji ornaments (🚀 💡 ✅). Use plain
markdown; section headers only when the host format needs them (PR body
sections are fine; inline review comments are not).

### 15. Title Case, curly quotes

Sentence case for headings. Straight quotes.

### 16. Chatbot artifacts

I hope this helps, Of course!, Certainly!, You're absolutely right!, Great
question!, Let me know if…, Here is a…, knowledge-cutoff hedges.

### 17. Filler

- "In order to achieve this goal" → "To achieve this"
- "Due to the fact that" → "Because"
- "At this point in time" → "Now"
- "In the event that" → "If"
- "has the ability to" → "can"
- "It is important to note that" → (delete)

### 18. Excessive hedging and empty endings

"It could potentially possibly be argued…" / "Exciting times lie ahead."
Cut. End on a specific fact or nothing.

### 19. Agent shorthand and compressed notation

Watch: arrow chains (`A → B → green`), stacked labels without verbs, telegram
fragments that require the session to decode.

Rewrite as complete sentences with an explicit subject and outcome. This is
reporting-style, not "make it longer."

### 20. Invented verification

Watch: "tests pass", "fully verified", "production-ready" without tool or repo
evidence in the draft or session.

Keep what was actually observed. Flag unsupported verification to the caller;
do not silently turn it into a different result or invent a green build.

### 21. Normative force drift

Watch: "must" softened to "should" / "might want to", or a suggestion hardened
into a requirement, solely for tone.

Keep the original force of the claim. Cleanup is not policy change.

### 22. Synonym-as-second-component

Engineering form of synonym cycling: the same service called "the worker",
then "the runner", then "the executor" in one PR body. Pick the repository
term and repeat it.

---

## Voice note

Stripping slop must not produce sterile mush *or* forced personality.

- **PR bodies, digests, specs:** clear, neutral, specific. Reporting register.
  Not a blog post. Not an aircraft manual.
- **Review comments and replies:** calm teammate voice. Direct, not theatrical.
- **Interactive review:** digest register plus teammate contractions. Same
  voice as explaining the figure to a coworker.
- **Procedures/references:** technical-writing craft; humanizer only cleans AI
  tells.
- **General prose:** keep genuine voice that was already present; do not invent
  first-person confessional style for engineering docs.

---

## Review and reply examples

These illustrate tone, not new findings to copy. Each rewrite uses only facts
in its draft. Keep the caller's severity and location.

### A finding with subtle jargon and repetition

**Before:**
> **High: Preserve the retry-state lifecycle invariant**
>
> This change moves `markComplete()` ahead of `send()`. The concern here is that this creates a correctness gap at the retry boundary: if `send()` times out, the job remains marked complete and the retry loop skips it. That means failed jobs will not be retried. Move `markComplete()` after a successful send to ensure the lifecycle remains consistent.

**After:**
> **High: Timed-out jobs won't be retried**
>
> If `send()` times out, the job is already marked complete, so the retry loop skips it. Move `markComplete()` after a successful send.

### A useful question that stays uncertain

**Before:**
> **Medium: Clarify the upstream duplicate-delivery contract**
>
> One potential concern is whether the sender can deliver the same event more than once. If so, `insert()` may create duplicate rows because it doesn't check `event_id`. Can you clarify whether the sender retries events?

**After:**
> **Medium: Can the sender deliver an event twice?**
>
> If the sender retries events, `insert()` may create duplicate rows because it doesn't check `event_id`.

Humanizing preserves this conditional question; it does not qualify a new
finding or establish that retries occur. Finding qualification belongs to the
review workflow.

### A reply to an addressed comment

**Before:**
> Great catch! You're right that the timeout needs to be configurable. I've addressed this feedback by wiring the existing `request_timeout` setting into the client, ensuring callers can now configure the timeout. The timeout test passes.

**After:**
> The client now uses `request_timeout`. The timeout test passes.

### A reply that disagrees

**Before:**
> Thanks for raising this concern about potentially accepting negative limits. After carefully tracing the validation flow, I confirmed that `parseLimit()` rejects negative values before this function is called. As such, no additional guard is needed at this boundary.

**After:**
> `parseLimit()` rejects negative values before this function is called, so an additional guard isn't needed here.

### Text that should stay as it is

> **High: Cache entries survive a permissions change**
>
> If an admin revokes access, the cached response is still served until its TTL expires. Invalidate this entry when permissions change.

This already names the condition, consequence, and correction. Leave it alone.
